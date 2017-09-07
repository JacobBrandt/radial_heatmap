export default function (kibana) {
  return new kibana.Plugin({
    // Plugin configuration
    uiExports: {
      visTypes: ['plugins/radial_heatmap/radial_heatmap_vis']
    }
  });
};
