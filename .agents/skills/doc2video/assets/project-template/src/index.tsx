import {AbsoluteFill, Composition, registerRoot} from 'remotion';

// Replace this preparation canvas with the document's scenes and real timing.
const Preparation = () => <AbsoluteFill style={{background: '#071827', color: '#f0f7fb', justifyContent: 'center', alignItems: 'center', fontSize: 72}}>视频制作准备中</AbsoluteFill>;
const Root = () => <Composition id="DocumentVideo" component={Preparation} width={1920} height={1080} fps={30} durationInFrames={90}/>;
registerRoot(Root);
