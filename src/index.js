import register from 'higlass-register';

import AnnotationsToInsetsMetaTrack from './AnnotationsToInsetsMetaTrack';
import Insets2dTrack from './Insets2dTrack';

register({
  name: 'Insets2dTrack',
  track: Insets2dTrack,
  config: Insets2dTrack.config,
});

register({
  name: 'AnnotationsToInsetsMetaTrack',
  track: AnnotationsToInsetsMetaTrack,
  isMetaTrack: true,
  config: AnnotationsToInsetsMetaTrack.config,
});
