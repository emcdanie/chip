// A page that throws never blanks the app (click test 22 Nov: Ask BELLA, then Needs you,
// turned CHIP into a white page). The error shows in place, plain, with a way back;
// the address keys the guard, so moving to another page clears it.
import { Component } from 'react';
import Button from '@bella/components/Button/Button';
import EmptyState from '@bella/components/EmptyState/EmptyState';
import Flow from './Flow.jsx';

export default class PageGuard extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('CHIP page error:', error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Flow gap={16} align="center" inset>
        <EmptyState size="page" title="This part of CHIP stopped" line={`It hit an error: ${String(this.state.error.message ?? this.state.error)}. Nothing was lost.`} />
        <Flow direction="row" gap={8} justify="center">
          <Button variant="secondary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload CHIP
          </Button>
        </Flow>
      </Flow>
    );
  }
}
