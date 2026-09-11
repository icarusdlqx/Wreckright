import type { Campaign } from '../../schema/campaign';
import { campaignStory, earnedCampaignStory } from '../../campaign/story';
import { FactionLogo } from '../FactionLogo';
import './campaignStory.css';

export function CampaignStoryPanel({ campaign, completedNodes }: { campaign: Campaign; completedNodes: readonly string[] }) {
  const story = campaignStory(campaign);
  if (story === undefined) return null;
  const earned = earnedCampaignStory(story, completedNodes);
  const current = earned.at(-1)!;
  return <section className={`campaign-story campaign-story-${campaign.presentation?.faction ?? 'linewrought'}`}
    aria-label="Your campaign story" data-testid="campaign-story">
    <header>{campaign.presentation === undefined ? null : <FactionLogo faction={campaign.presentation.faction} size={46} />}
      <div><span>{campaign.presentation?.title} / {story.title}</span><h3>{current.title}</h3></div></header>
    <p>{current.body[0]}</p>
    <details key={`${campaign.id}:${earned.length}`}><summary>Story so far · {earned.length} {earned.length === 1 ? 'entry' : 'entries'}</summary>
      <div className="campaign-story-entries">{earned.map((chapter, index) => <section key={index}>
        <h4>{chapter.title}</h4>{chapter.body.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
      </section>)}</div>
    </details>
  </section>;
}
