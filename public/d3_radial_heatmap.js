function radialHeatmap(element, chartData, settings) {
  // Settings
  var sliceFormatter = settings.sliceFormatter;
  var segmentFormatter = settings.segmentFormatter;
  var metricFormatter = settings.metricFormatter;
  var onSelection = settings.onSelection;

  // Select element
  var selection = d3.select(element);

  // Overall dimensions
  var visualizeEl = element.parentNode.parentNode;
  var graphHeight = visualizeEl.clientHeight - 20;
  var margin = { top: 0, right: 0, bottom: 0, left: 0 },
    chartWidth = visualizeEl.clientWidth - margin.left - margin.right,
    chartHeight = graphHeight - margin.top - margin.bottom;

  var prevMouse = null;
  var selectedSlice = -1;
  var selectedSegment = -1;
  var selecting = false;
  var selectedSegments = [];
  var selectedSlices = [];
  var startSelection = null;
  var currentSelection = null;

  // Constants
  var holePercent = .3;
  var radius = chartWidth < chartHeight ? (chartWidth / 2) : (chartHeight / 2);
  radius -= 30;  // Leave room for the labels
  var minRadius = radius * holePercent;
  var center = {
    x: chartWidth / 2,
    y: chartHeight / 2
  }
  var twoPi = Math.PI * 2;
  var halfPi = Math.PI / 2;

  // Get max, sliceSize and uniqueSlices
  var max = 0;
  var uniqueSlices = [];
  chartData.forEach(function (segment) {
    segment.data.forEach(function (slice) {
      if (uniqueSlices.indexOf(slice.name) === -1) {
        uniqueSlices.push(slice.name);
      }
      max = Math.max(max, slice.count);
    });
  });
  uniqueSlices.sort(function (a, b) {
    return a - b;
  });
  var sliceSize = 100 / uniqueSlices.length;

  // Update radius based on label sizes
  var maxLabel = 0;
  uniqueSlices.forEach(function (slice) {
    var sliceFormat = sliceFormatter(slice);
    sliceFormat = sliceFormat.slice(sliceFormat.indexOf(":") + 1, sliceFormat.length);
    sliceFormat.trim();
    maxLabel = Math.max(sliceFormat.length);
  });
  var reduce = 10 * maxLabel / 3;
  radius -= reduce;

  // Fill gaps
  chartData.forEach(function (segment) {
    if (segment.data.length !== uniqueSlices) {
      var missingData = [];
      uniqueSlices.forEach(function (uniqueSlice) {
        var missing = true;
        segment.data.forEach(function (slice) {
          if (slice.name === uniqueSlice) {
            missing = false;
          }
        });
        if (missing) {
          missingData.push({ name: uniqueSlice, count: 0 });
        }
      });
      var newData = [];
      uniqueSlices.forEach(function (uniqueSlice) {
        var count = segment.data.filter(function (slice) {
          return slice.name === uniqueSlice;
        });
        newData.push({ name: uniqueSlice, count: count.length ? count[0].count : 0 });
      });
      segment.data = newData;
    }
  });

  // Populate arc angles
  var startRadian, endRadian;
  chartData.forEach(function (segment, segmentIndex) {
    var startValue = 0;
    var seriesRadius = interpolate((chartData.length - segmentIndex) / chartData.length, minRadius, radius);
    segment.radius = seriesRadius;
    segment.data.forEach(function (slice) {
      var value = sliceSize;
      startRadian = map(startValue, 0, 100, 0, twoPi);
      endRadian = map(startValue + value, 0, 100, 0, twoPi);
      startValue += value;
      slice.startRadian = startRadian;
      slice.endRadian = endRadian;
    });
  });

  var colors = ["#5e4fa2", "#3288bd", "#66c2a5", "#abdda4", "#e6f598", "#fee08b", "#fdae61", "#f46d43", "#d53e4f", "#9e0142"];
  var heatmapColorScale = d3.scale.linear()
    .domain(linspace(0, max, colors.length))
    .range(colors);

  var canvas, graphCtx,
    selectedCanvas, selectedCtx;

  draw();

  function getSelection(mouse) {
    var pos = {
      x: center.y - mouse[1],
      y: center.x - mouse[0]
    };
    let radAngle = Math.atan2(pos.y, pos.x);
    if (radAngle < 0) {
      radAngle = radAngle + twoPi;
    }
    radAngle -= twoPi;
    radAngle = Math.abs(radAngle);

    var distance = distanceFromOrigin(pos.x, pos.y);
    var selSlice, selSegment;
    selSlice = selSegment = -1;
    for (var segmentIndex = 0; segmentIndex < chartData.length; segmentIndex++) {
      if (selSegment !== -1) {
        break;
      }
      var segment = chartData[segmentIndex];
      var nextSegment = chartData[segmentIndex + 1];
      if (!nextSegment) {
        break;
      }
      var innerRadius = Math.max(minRadius, nextSegment.radius);
      if (segment.radius >= distance && innerRadius <= distance) {
        selSegment = segmentIndex;
      }
      else {
        continue;
      }

      var startValue = 0;
      var startRadian = 0;
      var endRadian = 0;
      var seriesRadius = interpolate((chartData.length - segmentIndex) / chartData.length, minRadius, radius);
      for (var sliceIndex = 0; sliceIndex < segment.data.length; sliceIndex++) {
        if (selSlice !== -1 && sliceIndex !== selSlice) {
          break;
        }
        var slice = segment.data[sliceIndex];
        var value = sliceSize;
        startRadian = slice.startRadian;
        endRadian = slice.endRadian;
        startValue += value;
        if (startRadian <= radAngle && radAngle <= endRadian) {
          selSlice = sliceIndex;
        }
      }
    }

    return {
      slice: selSlice,
      segment: selSegment
    };
  }

  function draw() {
    selection.selectAll(".radial-heatmap-canvas").remove();
    selection.selectAll(".radial-heatmap-selection-canvas").remove();
    canvas = selection.append("canvas")
      .attr("class", "radial-heatmap-canvas")
      .attr("width", chartWidth)
      .attr("height", chartHeight)
      .style("cursor", "crosshair")
      .style("position", "absolute")
      .style("z-index", "-1")
      .style("left", margin.left + "px")
      .style("top", margin.top + "px");


    graphCtx = canvas.node().getContext("2d");
    selectedCanvas = selection.append("canvas")
      .attr("class", "radial-heatmap-selection-canvas")
      .attr("width", chartWidth)
      .attr("height", chartHeight)
      .style("position", "absolute")
      .style("z-index", "-2")
      .style("left", margin.left + "px")
      .style("top", margin.top + "px");
    selectedCtx = selectedCanvas.node().getContext("2d");

    canvas.on("mousedown", function (event) {
      if (selectedSegment !== -1) {
        selecting = true;
        selectedSlices = [];
        selectedSegments = [];
        var mouse = d3.mouse(this);
        var selection = getSelection(mouse);
        startSelection = selection;
        selectedSlices.push(startSelection.slice);
        selectedSegments.push(startSelection.segment);
      }
    })
    canvas.on("mouseup", function (event) {
      selecting = false;
      var mouse = d3.mouse(this);
      currentSelection = getSelection(mouse);
      if (currentSelection.slice > 0 && currentSelection.segment > 0) {
        var slices = [];
        selectedSlices.forEach(function (slice) {
          slices.push(uniqueSlices[slice]);
        });
        var segments = [];
        selectedSegments.forEach(function (segment) {
          segments.push(chartData[segment].name);
        });
        onSelection(slices, segments);
      }
      startSelection = null;
    });
    canvas.on("mouseleave", function (event) {
      selectedSlice = -1;
      selectedSegment = -1;
      currentSelection = null;
      drawCanvas();
    });
    canvas.on("mousemove", function (event) {
      var mouse = d3.mouse(this);
      var selection = getSelection(mouse);
      var prevSlice = selectedSlice;
      var prevSegment = selectedSegment;
      selectedSlice = selection.slice;
      selectedSegment = selection.segment;
      if (prevSlice !== selectedSlice || prevSegment !== selectedSegment) {
        if (selecting) {
          currentSelection = selection;
          // Find slice direction and fill in gaps
          var clockwise = false;
          var startIdx = startSelection.slice;
          var currentIdx = currentSelection.slice;
          if (currentIdx === startIdx) {
            selectedSlices = [];
          }

          if (selectedSlices.length >= 2) {
            // We can get direction from previous selected slices
            startIdx = selectedSlices[0];
            currentIdx = selectedSlices[1];
          }
          // See if we crossed over between quadrant 1 and 4
          var startQuadrant, currentQuadrant;
          if (startIdx >= uniqueSlices.length * .75) {
            startQuadrant = 4;
          }
          else if (startIdx <= uniqueSlices.length * .25) {
            startQuadrant = 1;
          }
          if (currentIdx >= uniqueSlices.length * .75) {
            currentQuadrant = 4;
          }
          else if (currentIdx <= uniqueSlices.length * .25) {
            currentQuadrant = 1;
          }
          if (startQuadrant && currentQuadrant && startQuadrant !== currentQuadrant) {
            startIdx = -startIdx;
            currentIdx = -currentIdx;
          }

          if (startIdx < currentIdx) {
            clockwise = true;
          }
          else if (startIdx > currentIdx) {
            clockwise = false;
          }

          // Now that we know the direction select the slices from start to current
          startIdx = startSelection.slice;
          currentIdx = currentSelection.slice;
          if (clockwise) {
            if (startIdx < currentIdx) {
              selectedSlices = [];
              for (var i = startIdx; i <= currentIdx; i++) {
                selectedSlices.push(i);
              }
            }
            else if (startIdx > currentIdx) {
              // Cross over
              selectedSlices = [];
              var i;
              for (i = startIdx; i <= uniqueSlices.length - 1; i++) {
                selectedSlices.push(i);
              }
              for (i = 0; i <= currentIdx; i++) {
                selectedSlices.push(i);
              }
            }
          }
          else if (!clockwise) {
            if (startIdx > currentIdx) {
              selectedSlices = [];
              for (var i = startIdx; i >= currentIdx; i--) {
                selectedSlices.push(i);
              }
            }
            else if (startIdx < currentIdx) {
              // Cross over
              selectedSlices = [];
              var i;
              for (i = startIdx; i >= 0; i--) {
                selectedSlices.push(i);
              }
              for (i = uniqueSlices.length - 1; i >= currentIdx; i--) {
                selectedSlices.push(i);
              }
            }
          }

          if (selectedSlices.length === 0) {
            selectedSlices.push(currentSelection.slice);
          }

          // Fill gaps for segments
          selectedSegments = [];
          var startIdx = startSelection.segment;
          var currentIdx = currentSelection.segment;
          if (startIdx < currentIdx) {
            for (var i = startIdx; i <= currentIdx; i++) {
              selectedSegments.push(i);
            }
          } else {
            for (var i = currentIdx; i <= startIdx; i++) {
              selectedSegments.push(i);
            }
          }
        }
        else {
          selectedSlices = [selection.slice];
          selectedSegments = [selection.segment];
          currentSelection = selection;
        }
        drawCanvas();
      }
      prevMouse = mouse;
    });

    drawCanvas();
  }

  function linspace(a, b, n) {
    let out = [];
    let delta = (b - a) / (n - 1);
    let i = 0;
    while (i < (n - 1)) {
      out.push(a + (i * delta));
      i++;
    }
    out.push(b);
    return out;
  }

  function distanceFromOrigin(x, y) {
    return Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
  }

  function interpolate(normValue, min, max) {
    return min + (max - min) * normValue;
  }

  function normalize(value, min, max) {
    return (value - min) / (max - min);
  }

  function map(value, min1, max1, min2, max2) {
    return interpolate(normalize(value, min1, max1), min2, max2);
  }

  function drawPieChart(ctx, selecting) {
    ctx.clearRect(0, 0, chartWidth, chartHeight);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(-halfPi);

    // Full chart
    var startValue = 0;
    var value, startRadian, endRadian;
    chartData.forEach(function (segment, segmentIndex) {
      startValue = 0;
      var full = true;
      if (selectedSegments.indexOf(segmentIndex) === -1 && selecting) {
        full = false;
      }
      var seriesRadius = interpolate((chartData.length - segmentIndex) / chartData.length, minRadius, radius);
      segment.data.forEach(function (slice, sliceIndex) {
        value = sliceSize;
        if (selectedSlices.indexOf(sliceIndex) === -1 && selecting) {
          startValue += value;
          return;
        }
        startRadian = slice.startRadian;
        endRadian = slice.endRadian;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.fillStyle = !selecting || full ? heatmapColorScale(slice.count) : "#FFFFFF";

        ctx.arc(0, 0, seriesRadius, startRadian, endRadian);
        ctx.lineTo(0, 0);
        ctx.fill();
        ctx.closePath();

        if (selecting && selectedSegments.length === 1 && selectedSlices.length === 1 &&
          currentSelection && currentSelection.slice >= 0 && currentSelection.segment >= 0) {
          var gradient = ctx.createRadialGradient(0, 0, radius * holePercent, 0, 0, radius * holePercent + radius * .85);
          gradient.addColorStop(0, "rgba(0,0,0,.1)");
          gradient.addColorStop(1, "rgba(0,0,0,0)");

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, seriesRadius, startRadian, endRadian);
          ctx.lineTo(0, 0);
          ctx.fill();
          ctx.closePath();
        }

        startValue += value;
      });
    });

    // Clear middle section for text
    ctx.beginPath();
    ctx.arc(0, 0, radius * holePercent, 0, 2 * Math.PI, false);
    ctx.clip();
    ctx.clearRect(0 - radius * holePercent - 1, 0 - radius * holePercent - 1,
      radius * holePercent * 2 + 2, radius * holePercent * 2 + 2);
    ctx.restore();


    if (currentSelection && currentSelection.slice >= 0 && currentSelection.segment >= 0) {
      var data, value;
      chartData.forEach(function (segment, segmentIndex) {
        if (currentSelection.segment === segmentIndex) {
          segment.data.forEach(function (slice, sliceIndex) {
            if (currentSelection.slice === sliceIndex) {
              data = segment;
              value = slice.count;
            }
          });
        }
      });
      var fontSize = radius * holePercent * .165;
      var addLine = radius * holePercent * .185;
      ctx.font = fontSize + "px Arial";
      ctx.fillStyle = "#848e96";
      ctx.textAlign = "center";
      var textXPos = chartWidth / 2;
      var textYPos = chartHeight / 2;
      ctx.fillText(segmentFormatter(chartData[currentSelection.segment].name), textXPos, textYPos);
      textYPos += addLine;
      ctx.fillText(sliceFormatter(chartData[currentSelection.segment].data[currentSelection.slice].name), textXPos, textYPos);

      textYPos += addLine;
      ctx.fillText(metricFormatter(value), textXPos, textYPos);
    }
  }

  function drawCanvas() {
    // Make full chart less visible while selecting
    canvas.style("opacity", selectedSegment === -1 ? 1 : 0.7);

    // Full chart
    if (selectedSegment === -1) {
      drawPieChart(graphCtx, false);
    }

    // Selected chart
    if (selectedSlices.length && selectedSegments.length) {
      drawPieChart(selectedCtx, true);
    }

    // Draw Labels
    drawLabels();
  };

  function drawLabels() {
    var startValue = -uniqueSlices.length / 4 * sliceSize;
    graphCtx.save();
    graphCtx.translate(center.x, center.y);
    graphCtx.strokeStyle = "#7a7a7a";
    graphCtx.lineWidth = ".5";

    selectedCtx.save();
    selectedCtx.translate(center.x, center.y);
    selectedCtx.fillStyle = "#848e96";
    var fontSize = radius * holePercent * .165;
    var addLine = radius * holePercent * .185;
    selectedCtx.font = fontSize + "px Arial";
    uniqueSlices.forEach(function (slice, sliceIndex) {
      var value = sliceSize;
      if (uniqueSlices.length > 25) {
        // Too many slices to show all labels so start spacing them out
        var mod = Math.ceil(uniqueSlices.length / 25);
        if (sliceIndex % mod !== 0) {
          startValue += value;
          return;
        }
      }
      var sliceFormat = sliceFormatter(slice);
      sliceFormat = sliceFormat.slice(sliceFormat.indexOf(":") + 1, sliceFormat.length);
      sliceFormat.trim();
      startRadian = map(startValue, 0, 100, 0, twoPi);
      if ((sliceIndex) > uniqueSlices.length / 2) {
        selectedCtx.textAlign = "right";
      }
      else if (sliceIndex === uniqueSlices.length / 2 || sliceIndex === 0) {
        selectedCtx.textAlign = "center";
      }
      else {
        selectedCtx.textAlign = "left";
      }

      var cos = Math.cos(startRadian);
      var sin = Math.sin(startRadian);

      // Line coordinates
      var innerX = (minRadius) * cos;
      var innerY = (minRadius) * sin;
      var x = (radius + 10) * cos;
      var y = (radius + 10) * sin;

      // Make text stick out further than the line
      var textX = (radius + 15) * cos;
      var textY = (radius + 15) * sin;

      graphCtx.beginPath();
      graphCtx.moveTo(innerX, innerY);
      graphCtx.lineTo(x, y);
      graphCtx.stroke();
      selectedCtx.fillText(sliceFormat, textX, textY);
      startValue += value;
    });

    selectedCtx.restore();
    graphCtx.restore();
  }
}

export default radialHeatmap;
