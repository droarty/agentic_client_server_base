import { PageHeader } from '../components/PageHeader';

export function AuthorDashboardPage() {
  return (
    <div className="page">
      <PageHeader title="Author Dashboard" />
      <main>
        <div className="settings-card">
          <h2>Content</h2>
          <p className="hint">Author tools will be available here. Coming soon.</p>
        </div>
      </main>
    </div>
  );
}
