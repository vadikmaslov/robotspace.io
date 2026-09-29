import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'RobotSpace guide and FAQ',
  description: 'A practical guide to finding robots, adding a project, proving ownership, contributing evidence and understanding moderation on RobotSpace.',
  alternates: { canonical: '/faq' },
}

type GuideSection = {
  id: string
  title: string
  audience: string
  children: React.ReactNode
}

function GuideSection({ id, title, audience, children }: GuideSection) {
  return <section id={id} className="scroll-mt-20 rounded-xl border p-6 md:p-8" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}>
    <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>{title}</h2><a href={`#${id}`} aria-label={`Link to ${title}`} className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>#{id}</a></div>
    <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}><strong style={{ color: 'var(--color-text-body)' }}>For:</strong> {audience}</p>
    <div className="mt-5 space-y-4 leading-relaxed" style={{ color: 'var(--color-text-body)' }}>{children}</div>
  </section>
}

export default function FaqPage() {
  const sections = [
    ['start', 'Start here'], ['find-robots', 'Find robots and compare'], ['registry', 'Use the software Registry'], ['add-project', 'Add a GitHub project'], ['claim-project', 'Claim a project'], ['developer-profile', 'Create a developer profile'], ['robotspace-yaml', 'Use robotspace.yaml'], ['compatibility', 'Suggest or report compatibility'], ['corrections', 'Suggest a correction'], ['notifications', 'Read moderation results'], ['official-resources', 'Official resources and manufacturer claims'], ['verification-statuses', 'What verification statuses mean'], ['admin-moderation', 'Administration and moderation'],
  ]
  return <main className="max-w-[1050px] mx-auto px-6 py-10">
    <div className="max-w-3xl"><p className="text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--color-accent-data)' }}>RobotSpace guide</p><h1 className="mt-2 text-4xl font-semibold tracking-tight" style={{ color: 'var(--color-text-heading)' }}>How RobotSpace works</h1><p className="mt-4 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>RobotSpace separates catalog facts, official manufacturer material and community experience. This guide explains what you can do, what you need before starting and why some changes wait for review.</p></div>

    <nav aria-label="Guide contents" className="mt-8 rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)' }}><h2 className="font-medium" style={{ color: 'var(--color-text-heading)' }}>Contents</h2><ol className="mt-3 grid gap-2 text-sm md:grid-cols-2">{sections.map(([id, title]) => <li key={id}><a href={`#${id}`} className="underline" style={{ color: 'var(--color-text-muted)' }}>{title}</a></li>)}</ol></nav>

    <div className="mt-8 space-y-5">
      <GuideSection id="start" title="Start here" audience="everyone">
        <p>Browse <Link href="/robots" className="underline">Robots</Link>, <Link href="/companies" className="underline">Companies</Link> and the <Link href="/registry" className="underline">Registry</Link> without an account. Use <Link href="/search" className="underline">Search</Link> when you know a name, company, project or developer handle.</p>
        <p>GitHub sign-in is needed only when you want to add a project, prove that you administer it, create a public developer profile, submit a correction or add a community compatibility report. An administrator account is separate from a GitHub Registry account.</p>
      </GuideSection>

      <GuideSection id="find-robots" title="Find robots and compare" audience="buyers, researchers and integrators">
        <ol className="list-decimal space-y-2 pl-5"><li>Open <Link href="/robots" className="underline">Robots</Link> and filter or search the catalog.</li><li>Open a robot page for specifications, the manufacturer, verified first-party resources and compatible software projects.</li><li>Use <strong>Compare</strong> on robot cards, then open <Link href="/compare" className="underline">Compare robots</Link> to see up to five selected robots side by side.</li></ol>
        <p>The ecosystem counts in comparison are coverage facts: published verified projects and verified first-party resources. They are not a quality score. A missing link means RobotSpace has not verified one yet - not that it does not exist.</p>
      </GuideSection>

      <GuideSection id="registry" title="Use the software Registry" audience="developers, integrators and visitors researching an ecosystem">
        <p>The <Link href="/registry" className="underline">Registry</Link> lists software projects such as SDKs, drivers, tools and datasets. Filters show project type, origin, licence and robots with a published verified compatibility.</p>
        <p>A public project page shows its repository facts, releases, verified owners and compatibility evidence. A project becomes visible only after its identity and publication checks. Repository information is refreshed in the background; if GitHub is unavailable, the last successful verified information remains visible.</p>
      </GuideSection>

      <GuideSection id="add-project" title="Add a GitHub project" audience="a developer with a public GitHub repository">
        <ol className="list-decimal space-y-2 pl-5"><li>Open <Link href="/projects/new" className="underline">Add project</Link> and sign in with GitHub.</li><li>Paste the HTTPS URL of a public GitHub repository.</li><li>RobotSpace imports available repository metadata as a draft.</li><li>Open the new project page and use <strong>Claim project</strong> to prove administration of the repository.</li></ol>
        <p>Importing is not ownership, publication or compatibility. A repository must be public. If import fails, check the URL and try again; do not put credentials into a URL.</p>
      </GuideSection>

      <GuideSection id="claim-project" title="Claim a project" audience="a GitHub administrator of an imported public repository">
        <p>On a project page select <strong>Claim project</strong>, sign in with GitHub and choose <strong>Confirm ownership</strong>. RobotSpace checks the signed-in account against the repository and requires GitHub to report administrator permission.</p>
        <p>A successful claim is <strong>VERIFIED</strong> and unlocks project management and a developer profile. If GitHub cannot prove the permission, the claim stays pending for editorial review or is rejected. You can revoke your own verified claim. Rechecking ownership needs a fresh GitHub sign-in.</p>
        <p>RobotSpace asks for identity information needed for this check, not write access to your repository. The short-lived grant is not shown in your browser session.</p>
      </GuideSection>

      <GuideSection id="developer-profile" title="Create a developer profile" audience="a verified project owner">
        <ol className="list-decimal space-y-2 pl-5"><li>First claim at least one project successfully.</li><li>Open <Link href="/developers/new" className="underline">Developer profile</Link>.</li><li>Choose a public lowercase handle, display name and optional bio.</li></ol>
        <p>Your profile lists public projects for which you have a verified claim and their verified robot connections. Reputation is context from accepted, evidence-backed contributions; it never bypasses moderation or makes a claim true by itself.</p>
      </GuideSection>

      <GuideSection id="robotspace-yaml" title="Use robotspace.yaml" audience="a project maintainer who wants to propose metadata">
        <p>You may place an optional <code>robotspace.yaml</code> in the default branch of a public GitHub repository. It can propose a project name, description, type, licence, homepage and robot requirements. See the <a href="https://github.com/vadikmaslov/robotspace.io/blob/main/docs/registry/robotspace-yaml-v1.md" className="underline">format reference</a> for the complete v1 schema.</p>
        <p>The file must be UTF-8, no larger than 64 KiB and use version 1. It accepts at most 50 robot entries. Unknown fields, credential-bearing URLs and unknown RobotSpace slugs are rejected. The manifest is never proof of ownership and never publishes a project or compatibility by itself.</p>
      </GuideSection>

      <GuideSection id="compatibility" title="Suggest or report compatibility" audience="verified project owners and independent contributors">
        <p><strong>Project owner:</strong> open your project’s <strong>Manage project</strong> page or a robot’s ecosystem section. Select your claimed project, the robot and a public HTTPS evidence URL. The proposed relationship is pending until an administrator reviews it.</p>
        <p><strong>Independent contributor:</strong> open an existing verified compatibility and choose whether it works as described or does not work as described. Provide a public HTTPS source. One account can send one report per compatibility. A verified owner cannot submit an “independent” report about their own project.</p>
        <p>Accepted reports become public beside editorial evidence. A dispute does not erase confirmations or silently rewrite the editorial record. Pending and rejected reports stay out of the public evidence view but remain in the audit history.</p>
      </GuideSection>

      <GuideSection id="corrections" title="Suggest a correction" audience="any GitHub-signed-in contributor">
        <p>From a robot or project page select <strong>Submit correction</strong>. Describe what should change and add a public HTTPS evidence URL. The suggestion is submitted for moderation; it does not immediately edit the catalog.</p>
        <p>Use evidence that directly supports the proposed fact. Generic feedback is useful to editors, but it is not automatically published as a catalog fact.</p>
      </GuideSection>

      <GuideSection id="notifications" title="Read moderation results" audience="Registry contributors">
        <p>After a correction, compatibility suggestion, community report or claim changes status, RobotSpace creates an in-app notice. Open <Link href="/notifications" className="underline">Notifications</Link> while signed in to see your latest results and mark them as read. The page currently keeps the latest 50 notices.</p>
      </GuideSection>

      <GuideSection id="official-resources" title="Official resources and manufacturer claims" audience="manufacturers and visitors evaluating official material">
        <p>Official resources on a robot page are added by RobotSpace editors with an HTTPS destination and separate evidence that it is controlled or endorsed by the manufacturer. They remain distinct from community projects.</p>
        <p>A manufacturer can start from its company page and choose <strong>Claim this company</strong>. RobotSpace provides a 48-hour DNS TXT challenge under the company’s already verified website domain. After the matching TXT record is found, the claimant can publish a statement, SDK link, document, repository, release or specification with evidence on that same domain.</p>
        <p>Manufacturer statements are labelled as the manufacturer position. They do not edit editorial specifications, compatibility records or community reports. The claimant or an administrator can revoke manufacturer access; the historical record remains, while current publishing access and the badge stop immediately.</p>
      </GuideSection>

      <GuideSection id="verification-statuses" title="What verification statuses mean" audience="everyone">
        <dl className="space-y-3"><div><dt className="font-medium">Discovered / draft</dt><dd style={{ color: 'var(--color-text-muted)' }}>Imported or proposed information that is not public verification.</dd></div><div><dt className="font-medium">Pending</dt><dd style={{ color: 'var(--color-text-muted)' }}>A claim, correction, compatibility or report is waiting for a permitted check or administrator decision.</dd></div><div><dt className="font-medium">Verified</dt><dd style={{ color: 'var(--color-text-muted)' }}>RobotSpace has completed the required identity, evidence or editorial check for that record.</dd></div><div><dt className="font-medium">Rejected / revoked</dt><dd style={{ color: 'var(--color-text-muted)' }}>The record did not meet the evidence or permission rules, or access was withdrawn. It is not presented as current verified information.</dd></div></dl>
      </GuideSection>

      <GuideSection id="admin-moderation" title="Administration and moderation" audience="RobotSpace administrators">
        <p>Administrators review pending Registry corrections, compatibility suggestions and community reports in the Registry review queue. They verify the evidence, accept or reject the submitted record and can inspect compatibility history. Pending project or company claims appear in the claims queue; verified manufacturer access can be revoked there.</p>
        <p>Administrative decisions add an audit record and notify the contributor. Do not use an admin action to turn an unverified source into a fact: preserve the source, apply the status rules and use a new record when a published immutable resource needs correction.</p>
      </GuideSection>
    </div>
    <aside className="mt-8 rounded-xl border p-6" style={{ borderColor: 'var(--color-border-color)' }}><h2 className="font-medium" style={{ color: 'var(--color-text-heading)' }}>Need help?</h2><p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>If a page shows an error or a status you do not understand, keep the public URL and the time of the attempt, then contact RobotSpace through the site contact route. Never include a password, OAuth code, API key or DNS token in a public message.</p></aside>
  </main>
}
