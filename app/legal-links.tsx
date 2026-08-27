export function LegalLinks({ version, environment }: { version: string; environment: string }) {
  return (
    <footer className="trust-footer" aria-label="FaultCite release and policy links">
      <span>FaultCite {version} · {environment}</span>
      <nav aria-label="Policy and support">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Pilot terms &amp; safety</a>
        <a href="/support">Support</a>
      </nav>
    </footer>
  );
}
