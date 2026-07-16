import "./index.css";
import { Composition, Still } from "remotion";
import { MaqamDemo } from "./MaqamDemo";
import { MaqamPoster } from "./Poster";
import { ProductLoopOverview } from "./ProductLoopOverview";
import { CrawlerOverview } from "./CrawlerOverview";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MaqamProof60"
        component={MaqamDemo}
        durationInFrames={1800}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Still
        id="MaqamProofPoster"
        component={MaqamPoster}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="ProductLoopEcosystem55"
        component={ProductLoopOverview}
        durationInFrames={1650}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="MaqamCrawlerResearch55"
        component={CrawlerOverview}
        durationInFrames={1650}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
