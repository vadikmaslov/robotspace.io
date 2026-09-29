import Link from 'next/link'

export async function generateMetadata() {
  return { title: 'Privacy and Data', description: 'Data used by RobotSpace accounts, public contributions and contact requests.' }
}

export default function PrivacyPage() {
  return (
    <div className="max-w-[760px] mx-auto px-6 py-12" style={{ color: 'var(--color-text-body)' }}>
      <h1 className="text-3xl font-semibold mb-6" style={{ color: 'var(--color-text-heading)' }}>Privacy Policy</h1>
      <div className="prose prose-sm space-y-4" style={{ color: 'var(--color-text-muted)' }}>
        <p>Last updated: 29 September 2026. This page describes the current MVP implementation. Operator details and the complete legal documentation are still being finalized.</p>
        <h2 className="text-xl">Data we use</h2>
        <p>Contact forms store the name, email, company, country and message you provide. Catalog submissions store the proposed data, source URLs and optional email. These records are used to review submissions and respond to requests; operational notifications may be sent through our email provider.</p>
        <p>GitHub sign-in associates your GitHub account identifier with a Registry account. Public profile information, repository information, claims, contributions and moderation history are used to operate the Registry. Information you submit for publication may become visible on public project, developer and robot pages. Do not submit private repository content, credentials or personal information about others.</p>
        <h2 className="text-xl">Cookies and external services</h2>
        <p>Authentication uses essential session and security cookies. Your theme preference is stored in your browser. Third-party visitor analytics and session recording are disabled in this version. Previously collected analytics data is not automatically deleted by this change.</p>
        <p>GitHub and Google process sign-in under their own policies. Some images are loaded from external hosts, which can receive your IP address and browser request information. Following an external source link takes you to that provider.</p>
        <h2 className="text-xl">Retention and requests</h2>
        <p>Security and server logs may contain request information. Automated retention and deletion are not yet implemented consistently across all MVP data stores. We do not promise automatic deletion after a fixed period.</p>
        <p>For an access, correction or deletion request, use the <Link href="/quote?robot=Privacy%20request" className="underline">contact form</Link> and identify the affected account or public URL. Do not send passwords or identity documents. Requests require review and identity verification; deletion is not immediate and may be limited by legal obligations or records needed to handle abuse.</p>
      </div>
    </div>
  )
}
