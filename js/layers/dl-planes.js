/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'dl-planes',
  shelf: 'lyrGrpTransport',
  order: 10,
  key: 'planes',
  label: 'lyrPlanes',
  share: true,
  lazy: ['aviationLive'],
  registry: ['aircraft'],
  atlas: ['layers.planeAltitude', 'layers.aircraftTrack'],
};
