import 'plugins/radial_heatmap/radial_heatmap.less';
import 'plugins/radial_heatmap/radial_heatmap_controller';
import TemplateVisTypeTemplateVisTypeProvider from 'ui/template_vis_type/template_vis_type';
import VisSchemasProvider from 'ui/vis/schemas';
import radialHeatmapTemplate from 'plugins/radial_heatmap/radial_heatmap_controller.html';
import visTypes from 'ui/registry/vis_types';
import AggResponsePointSeriesPointSeriesProvider from 'ui/agg_response/point_series/point_series';

visTypes.register(function RadialHeatmapProvider(Private) {
  const TemplateVisType = Private(TemplateVisTypeTemplateVisTypeProvider);
  const Schemas = Private(VisSchemasProvider);

  return new TemplateVisType({
    name: 'radial_heatmap',
    title: 'Radial Heatmap',
    description: 'A visualization that renders cyclical data',
    icon: 'fa-life-ring',
    template: radialHeatmapTemplate,
    params: {
      editor: require('plugins/radial_heatmap/radial_heatmap_vis_params.html'),
      defaults: {
        showLegend: true,
        colorType: 'Spectral'
      },
      colorTypes: ['Spectral', 'Orange', 'Purple', 'Pink']
    },
    schemas: new Schemas([
      {
        group: 'metrics',
        name: 'metric',
        title: 'Value',
        required: true,
        min: 1,
        max: 1,
        aggFilter: ['count', 'avg', 'sum', 'min', 'max', 'cardinality', 'std_dev']
      },
      {
        group: 'buckets',
        name: 'segments',
        icon: 'fa fa-th',
        title: 'Segments',
        mustBeFirst: true,
        required: true,
        min: 1,
        max: 1,
        aggFilter: '!geo_hash'
      },
      {
        group: 'buckets',
        name: 'slices',
        icon: 'fa fa-eye',
        title: 'Slices',
        required: true,
        min: 1,
        max: 1,
        aggFilter: '!geo_hash'
      }
    ])
  });
});
