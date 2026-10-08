import { Component, type ReactNode } from 'react';
import { Flower2 } from 'lucide-react';

/** Keeps one broken screen from turning the whole Mini App white: the buyer sees a short message and can reload. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('GulBar screen crashed', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="page-content"><div className="empty" role="alert">
      <Flower2 size={40} />
      <h1>Nimadir xato ketdi</h1>
      <p>Sahifani yangilang. Savatingiz va buyurtmalaringiz saqlanib qoladi.</p>
      <button className="primary" onClick={() => location.reload()}>Sahifani yangilash</button>
    </div></main>;
  }
}
