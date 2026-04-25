import { useParams } from 'react-router-dom'
import MarketingLayout from '../components/layout/MarketingLayout'
import { MarketingContainer, SectionHeader, SoftCard, SurfaceSection } from '../components/marketing/MarketingPrimitives'

const CONTENT = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'April 1, 2026',
    sections: [
      { heading: 'Information we collect', body: 'We collect information you provide when creating an account (name, email, company), information generated through your use of ContentCard (brand kit settings, generated content, usage data), and technical information (device type, browser, IP address).' },
      { heading: 'How we use your information', body: 'We use your information to provide and improve ContentCard, send product updates and support communications, process payments, and comply with legal obligations. We do not sell your data to third parties.' },
      { heading: 'Data storage', body: 'Your data is stored on secure servers. We use industry-standard encryption in transit and at rest. Content you generate and brand assets you upload are stored in your account and not shared with other users or organisations.' },
      { heading: 'Your rights', body: 'You have the right to access, correct, export, or delete your personal data at any time. To exercise these rights, contact us at hellovoya@gmail.com.' },
      { heading: 'Cookies', body: 'We use cookies to keep you logged in and to understand how ContentCard is used. You can control cookies through your browser settings.' },
      { heading: 'Contact', body: 'Questions about this policy? Email hellovoya@gmail.com.' },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: 'April 1, 2026',
    sections: [
      { heading: 'Acceptance', body: 'By using ContentCard you agree to these terms. ContentCard is a product of Voyatech Limited. If you are using ContentCard on behalf of an organisation, you represent that you have authority to bind that organisation.' },
      { heading: 'Permitted use', body: 'ContentCard is licensed for lawful business use. You may not use ContentCard to generate content that is illegal, fraudulent, harassing, defamatory, or in violation of any third-party rights.' },
      { heading: 'Your content', body: 'You own the content you create using ContentCard. By using the platform, you grant Voyatech Limited a limited licence to process that content to provide the service.' },
      { heading: 'Billing and cancellation', body: 'Subscriptions are billed monthly. You can cancel at any time; cancellation takes effect at the end of the current billing period. No refunds are issued for partial months.' },
      { heading: 'Service availability', body: 'We aim for high uptime but do not guarantee uninterrupted service. Enterprise customers have SLA-backed uptime guarantees.' },
      { heading: 'Limitation of liability', body: 'ContentCard is not liable for indirect, consequential, or incidental damages arising from use of the platform. Our total liability is limited to the fees paid in the last 12 months.' },
    ],
  },
  security: {
    title: 'Security',
    updated: 'April 1, 2026',
    sections: [
      { heading: 'Infrastructure', body: 'ContentCard is hosted on enterprise-grade cloud infrastructure with automatic failover, daily backups, and geographic redundancy.' },
      { heading: 'Encryption', body: 'All data in transit is encrypted using TLS 1.2+. Data at rest is encrypted using AES-256. Passwords are hashed with bcrypt.' },
      { heading: 'Access control', body: 'Employee access to production systems is restricted by role and requires multi-factor authentication. Access is reviewed quarterly.' },
      { heading: 'Vulnerability disclosure', body: 'If you discover a security vulnerability in ContentCard, please report it to hellovoya@gmail.com. We will respond within 48 hours and credit responsible disclosures.' },
      { heading: 'Compliance', body: 'ContentCard is designed with NDPR (Nigeria Data Protection Regulation) and GDPR compliance in mind. We are working toward formal certifications in 2026.' },
    ],
  },
  support: {
    title: 'Support',
    updated: 'April 1, 2026',
    sections: [
      { heading: 'Getting help', body: 'For help with ContentCard, email hellovoya@gmail.com. We respond to all support requests within one business day. Enterprise customers receive priority response within 4 hours.' },
      { heading: 'What we help with', body: 'Our support team can help with account setup, billing questions, brand kit configuration, team permissions, troubleshooting generation issues, and any other product questions.' },
      { heading: 'Self-service resources', body: 'We\'re building a full knowledge base and video tutorial library. In the meantime, our team is available to walk you through anything.' },
      { heading: 'Enterprise support', body: 'Enterprise plan customers have a dedicated Customer Success Manager who handles onboarding, quarterly business reviews, and escalations.' },
    ],
  },
}

export default function LegalPage() {
  const { type } = useParams()
  const page = CONTENT[type] || CONTENT.privacy

  return (
    <MarketingLayout>
      <SurfaceSection className="border-b border-fog">
        <MarketingContainer className="max-w-3xl">
          <SectionHeader eyebrow={page.title} title={page.title} subtitle={`Last updated: ${page.updated}`} />
        </MarketingContainer>
      </SurfaceSection>
      <SurfaceSection>
        <MarketingContainer className="max-w-3xl space-y-5">
          {page.sections.map(({ heading, body }) => (
            <SoftCard key={heading} className="p-6">
              <h2 className="text-ink font-bold text-lg mb-3">{heading}</h2>
              <p className="text-ink/65 text-sm leading-relaxed">{body}</p>
            </SoftCard>
          ))}
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
