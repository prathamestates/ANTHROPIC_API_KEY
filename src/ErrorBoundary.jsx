import React from "react";

// A blank white screen tells you nothing. This catches any crash during
// rendering and shows the real error message + stack instead, so it can
// actually be diagnosed rather than guessed at.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("Stockly crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: "monospace", padding: 20, background: "#fff", color: "#111", minHeight: "100vh" }}>
          <h1 style={{ color: "#b91c1c", fontSize: 18 }}>Stockly hit an error</h1>
          <p style={{ marginTop: 10 }}>{String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error)}</p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 16, color: "#555" }}>
            {this.state.error && this.state.error.stack}
          </pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 16, color: "#888" }}>
            {this.state.info && this.state.info.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
