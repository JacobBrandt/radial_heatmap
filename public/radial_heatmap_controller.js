import uiModules from 'ui/modules';
import d3 from 'd3';
import radialHeatmap from 'plugins/radial_heatmap/d3_radial_heatmap.js';
import moment from 'moment';
import Binder from 'ui/binder';
import VislibVisTypeBuildChartDataProvider from 'ui/vislib_vis_type/build_chart_data';
import AggResponseTabifyProvider from 'ui/agg_response/tabify/tabify';

const module = uiModules.get('radial_heatmap', ['kibana']);
module.controller('RadialHeatmapController', function ($scope, $timeout, $element, Private) {
  const ResizeChecker = Private(require('ui/vislib/lib/resize_checker'));
  const resizeChecker = new ResizeChecker($element);
  const queryFilter = Private(require('ui/filter_bar/query_filter'));
  const binder = new Binder();
  binder.on(resizeChecker, 'resize', function () {
    resize();
  });

  function resize() {
    $scope.$emit('render');
  }

  $scope.queryFilter = queryFilter;

  $scope.$watchMulti(['esResponse'], function ([resp]) {
    if (resp === undefined) {
      return;
    }

    $scope.processAggregations(resp.aggregations);

    $scope.$emit('render');
  });

  $scope.$watch('vis.params', (options) => $scope.$emit('render'));

  $scope.processAggregations = function (aggregations) {
    const sourceData = [];

    if (aggregations &&
      ($scope.vis.aggs.bySchemaName.metric !== undefined) &&
      ($scope.vis.aggs.bySchemaName.slices !== undefined)) {
      const metricsAgg = $scope.vis.aggs.bySchemaName.metric[0];
      const slicesAgg = $scope.vis.aggs.bySchemaName.slices[0];
      const slicesAggId = slicesAgg.id;

      if ($scope.vis.aggs.bySchemaName.segments !== undefined) {
        const segmentsAgg = $scope.vis.aggs.bySchemaName.segments[0];
        const viewByBuckets = aggregations[segmentsAgg.id].buckets;
        _.each(viewByBuckets, function (bucket) {
          const sourceObj = {};
          sourceObj.name = bucket.key;
          let data = [];
          const bucketsForViewByValue = bucket[slicesAggId].buckets;
          _.each(bucketsForViewByValue, function (valueBucket) {
            let value = null;
            if ("std_dev" === metricsAgg.__type.name) {
              value = valueBucket[metricsAgg.id].std_deviation;
            }
            else {
              value = metricsAgg.getValue(valueBucket);
            }
            data.push({ name: valueBucket.key, count: value });
          });
          sourceObj.data = data;
          sourceData.push(sourceObj);
        });
      } else {
        let data = [];
        const buckets = aggregations[slicesAggId].buckets;
        _.each(buckets, function (bucket) {
          data.push({ name: bucket.key, count: metricsAgg.getValue(bucket) });
        });

        sourceData.push({
          name: metricsAgg.makeLabel(),
          data: data
        });
      }
    }

    $scope.sourceData = sourceData;
  };
})
  .directive('radial', function (config, $timeout, timefilter) {
    return {
      link: function (scope, elem, attr) {
        scope.$on('render', function (event, d) {
          if (scope.sourceData !== undefined && scope.vis.aggs.length !== 0 && scope.vis.aggs.bySchemaName.slices !== undefined) {
            renderChart();
          }
        });

        function applyFilters(selectedSlices, selectedSegments) {
          console.log(selectedSlices, selectedSegments);
          var sliceFilter = getFilter(selectedSlices, "slices");
          var segmentFilter = getFilter(selectedSegments, "segments");
          applyFilter(sliceFilter, "slices");
          applyFilter(segmentFilter, "segments");
          console.log(sliceFilter);
          console.log(segmentFilter);
        }

        function applyFilter(filter, schemaName) {
          if (filter) {
            var agg = scope.vis.aggs.bySchemaName[schemaName][0];
            var currentFilter = getExistingFilter(agg)
            scope.queryFilter.removeFilter(currentFilter);
            scope.queryFilter.addFilters(filter);
          }
        }

        function getFilter(values, schemaName) {
          var agg = scope.vis.aggs.bySchemaName[schemaName][0];
          var type = agg.params.field.type;
          var filter;
          if (type === "number") {
            filter = getNumberFilter(values, schemaName);
          }
          else if (type === "date") {
            filter = getNumberFilter(values, schemaName);
            if (filter.bool === undefined) {
              console.log("apply time filter");
              // Only one range so it was a continuous time range and not disjointed.
              // We can apply the time filter instead.
              applyTimeFilter(filter.range[agg.params.field.name].gte, filter.range[agg.params.field.name].lte);
            }
            // Can't apply two different times right now
            filter = null;
          }
          else if (type === "string") {
            values.forEach(function (value, index, data) {
              data[index] = '\"' + value + '\"';
            });
            filter = {
              meta: {
                index: scope.vis.indexPattern.id,
                alias: agg.makeLabel() + ":(" + values.length + " selected)"
              },
              query_string: {
                default_field: agg.params.field.name,
                query: values.join(" OR "),
              }
            };
          }
          return filter;
        }

        function getNumberFilter(values, schemaName) {
          let newFilter = {
            meta: {
              index: scope.vis.indexPattern.id,
            },
          };
          var agg = scope.vis.aggs.bySchemaName[schemaName][0];
          var alias = agg.makeLabel() + ":";
          var interval;
          var type = agg.params.field.type;
          if (type === "date") {
            interval = agg.buckets.getInterval().asMilliseconds();
          }
          else {
            interval = agg.params.interval;
          }
          var sliceSize = interval;

          if (values.length === 1) {
            newFilter.range = {};
            newFilter.range[agg.params.field.name] = {
              gte: values[0],
              lte: values[0] + sliceSize
            };
            alias = alias + "(" + newFilter.range[agg.params.field.name].gte + " to " + newFilter.range[agg.params.field.name].lte + ")";
          }
          else {

            let minExtent = Infinity;
            let maxExtent = -Infinity;
            values.forEach(function (value) {
              minExtent = Math.min(minExtent, value);
              maxExtent = Math.max(maxExtent, value);
            });

            // See if our numbers are disjointed.
            var disjointed = -1;
            values.forEach(function (value, index) {
              if (index !== values.length - 1) {
                if (Math.abs(value - values[index + 1]) > sliceSize) {
                  disjointed = index;
                }
              }
            });

            if (disjointed === -1) {
              newFilter.range = {};
              newFilter.range[agg.params.field.name] = {
                gte: minExtent,
                lte: maxExtent + sliceSize
              };
              alias = alias + "(" + newFilter.range[agg.params.field.name].gte + " to " + newFilter.range[agg.params.field.name].lte + ")";
            }
            else {
              // Disjointed.  Need two ranges.
              newFilter.bool = {
                should: [
                  { range: {} },
                  { range: {} }
                ]
              };

              var ranges = [];
              for (var i = 1; i <= 2; i++) {
                var sliced;
                if (i == 1) {
                  sliced = values.slice(0, disjointed + 1);
                }
                else {
                  sliced = values.slice(disjointed + 1);
                }
                sliced.sort();
                var range = {
                  gte: sliced[0],
                  lte: sliced[sliced.length - 1] + sliceSize
                };
                ranges.push(range);
              }

              newFilter.bool.should[0].range[agg.params.field.name] = ranges[0];
              newFilter.bool.should[1].range[agg.params.field.name] = ranges[1];
              if (type === "date") {
                var format = getScaledInterval(schemaName);
                newFilter.bool.should[0].range[agg.params.field.name].format =
                  newFilter.bool.should[1].range[agg.params.field.name].format = format;
                newFilter.bool.should[0].range[agg.params.field.name].lte = moment(newFilter.bool.should[0].range[agg.params.field.name].lte).format(format);
                newFilter.bool.should[0].range[agg.params.field.name].gte = moment(newFilter.bool.should[0].range[agg.params.field.name].gte).format(format);
                newFilter.bool.should[1].range[agg.params.field.name].lte = moment(newFilter.bool.should[1].range[agg.params.field.name].lte).format(format);
                newFilter.bool.should[1].range[agg.params.field.name].gte = moment(newFilter.bool.should[1].range[agg.params.field.name].gte).format(format);
              }
              alias = alias + "(" + ranges[0].gte + " to " + ranges[0].lte + ")"
                + " and (" + ranges[1].gte + " to " + ranges[1].lte + ")";
            }
          }

          newFilter.meta.alias = alias;
          return newFilter;
        }

        function applyTimeFilter(minExtent, maxExtent) {
          timefilter.time.from = moment(minExtent);
          timefilter.time.to = moment(maxExtent);
          timefilter.time.mode = 'absolute';
        }

        function getExistingFilter(agg) {
          let found = false;
          let min = 0;
          let max = 0;
          let key = agg.params.field.name;
          let existingFilter = null;
          _.flatten([scope.queryFilter.getAppFilters(), scope.queryFilter.getGlobalFilters()]).forEach(function (it) {
            if (it.meta.disabled || it.meta.negate) {
              return;
            }
            if (it.meta.key === key) {
              var filterMin = -1;
              var filterMax = -1;
              if ('gte' in it.range[key]) filterMin = it.range[key].gte;
              if ('gt' in it.range[key]) filterMin = it.range[key].gt;
              if ('lte' in it.range[key]) filterMax = it.range[key].lte;
              if ('lt' in it.range[key]) filterMax = it.range[key].lt;
              if (filterMin !== -1 && filterMax !== -1) {
                if (!found || filterMin < min) min = filterMin;
                if (!found || filterMax > max) max = filterMax;
                found = true;
                existingFilter = it;
              }
            }
          });
          return existingFilter;
        }

        function getScaledInterval(schemaName) {
          const agg = scope.vis.aggs.bySchemaName[schemaName][0];
          const aggInterval = agg.buckets.getInterval();
          let interval = aggInterval;
          let rules = config.get('dateFormat:scaled');

          for (let i = rules.length - 1; i >= 0; i--) {
            let rule = rules[i];
            if (!rule[0] || interval >= moment.duration(rule[0])) {
              return rule[1];
            }
          }

          return config.get('dateFormat');
        }

        function renderChart() {
          function sliceFormatter(val) {
            var slicesAgg = scope.vis.aggs.bySchemaName.slices[0];
            var label = slicesAgg.makeLabel();
            if (scope.vis.aggs.bySchemaName.slices[0].params.field.type === "date") {
              val = moment(val).format(getScaledInterval("slices"));
            }
            return label + ": " + val;
          }

          function segmentFormatter(val) {
            var segmentsAgg = scope.vis.aggs.bySchemaName.segments[0];
            var label = segmentsAgg.makeLabel();
            if (scope.vis.aggs.bySchemaName.segments[0].params.field.type === "date") {
              val = moment(val).format(getScaledInterval("segments"));
            }
            return label + ": " + val;
          }

          function metricFormatter(val) {
            var metricAgg = scope.vis.aggs.bySchemaName.metric[0];
            var label = metricAgg.makeLabel();
            return label + ": " + val;
          }

          radialHeatmap(elem[0], scope.sourceData, {
            metricFormatter: metricFormatter,
            segmentFormatter: segmentFormatter,
            sliceFormatter: sliceFormatter,
            onSelection: applyFilters
          }
          );
        }
      }
    }
  });
