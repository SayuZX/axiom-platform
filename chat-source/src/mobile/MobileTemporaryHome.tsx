import { UIIcon as Icon } from '../components/UIIcon';

export function MobileTemporaryHome({ onLearnMore, onPersonalization, personalized }: { onLearnMore: () => void; onPersonalization: () => void; personalized: boolean }) {
  return <section className="m-temporary-home">
    <h1>Temporary chat</h1>
    <p>This chat won’t appear in your history.</p>
    <button type="button" className="m-learn-more" onClick={onLearnMore}>Learn more</button>
    <button type="button" className="m-personalization" onClick={onPersonalization}>{personalized ? 'Personalized' : 'Not personalized'}<Icon name="down" size={16}/></button>
  </section>;
}
