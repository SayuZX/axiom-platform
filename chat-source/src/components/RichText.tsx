import { Component, lazy, Suspense, type ReactNode } from 'react';

const Renderer = lazy(() => import('./RichTextRenderer'));

class RichTextBoundary extends Component<{ children: ReactNode; text: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: { text: string }) {
    if (this.state.failed && previous.text !== this.props.text) this.setState({ failed: false });
  }
  render() { return this.state.failed ? <span className="d-rich-fallback">{this.props.text}</span> : this.props.children; }
}

export function RichText({ text }: { text: string }) {
  return <div className="d-rich-text"><RichTextBoundary text={text}><Suspense fallback={<span className="d-rich-fallback">{text}</span>}><Renderer text={text}/></Suspense></RichTextBoundary></div>;
}
