import { Link } from 'react-router-dom';
import { ArrowLeft, ScrollText, Users, UserCheck, Eye, EyeOff, ShieldAlert, FileText, Shield, MessageSquare, CreditCard, Scale, LogOut, RefreshCw, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

function Section({ icon: Icon, number, title, children }) {
  return (
    <div className="group relative rounded-xl border bg-card p-5 transition-colors hover:border-primary/20 hover:bg-accent/30">
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight">
            <span className="text-muted-foreground mr-1.5">{number}.</span>
            {title}
          </h2>
          <div className="mt-2 text-sm leading-relaxed text-muted-foreground space-y-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Back button */}
        <div className="mb-8">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" asChild>
            <Link to={-1} onClick={(e) => { e.preventDefault(); window.history.back(); }}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>

        {/* Hero header */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <ScrollText className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Terms &amp; Conditions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: March 19, 2026
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          <Section icon={FileText} number={1} title="Introduction">
            <p>
              Welcome to Personas, a social platform designed for students of COMSATS University Lahore.
              By accessing or using the platform, you agree to be bound by these Terms and Conditions.
              If you do not agree, you must not use the service.
            </p>
          </Section>

          <Section icon={UserCheck} number={2} title="Eligibility">
            <p>
              Personas is intended exclusively for students of COMSATS University Lahore.
              You must register using a valid university email (e.g., @cuilahore.edu.pk)
              and provide accurate information. We reserve the right to suspend accounts
              that do not meet these requirements.
            </p>
          </Section>

          <Section icon={Users} number={3} title="User Accounts">
            <ul className="list-disc pl-5 space-y-1">
              <li>You are responsible for maintaining the confidentiality of your account.</li>
              <li>You must not share your credentials.</li>
              <li>You are responsible for all activity under your account.</li>
            </ul>
          </Section>

          <Section icon={Eye} number={4} title="Personas System">
            <div className="space-y-3">
              <div className="rounded-lg border bg-background/50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Public Persona</span>
                </div>
                <p className="text-xs">
                  Content posted under this persona may be traceable to your identity and university registration.
                </p>
              </div>
              <div className="rounded-lg border bg-background/50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <EyeOff className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Anonymous Persona</span>
                </div>
                <p className="text-xs">
                  Content posted under this persona is not publicly linked to your identity.
                  However, anonymous activity may still be internally associated with your account
                  for moderation, security, and legal compliance purposes.
                </p>
              </div>
            </div>
          </Section>

          <Section icon={ShieldAlert} number={5} title="Acceptable Use">
            <p>You agree <strong className="text-foreground">NOT</strong> to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Harass, threaten, or bully others</li>
              <li>Post defamatory, abusive, or hateful content</li>
              <li>Share private information of others (doxxing)</li>
              <li>Impersonate another individual</li>
              <li>Post illegal or harmful content</li>
              <li>Spam or manipulate platform features (including trends)</li>
            </ul>
          </Section>

          <Section icon={FileText} number={6} title="Content Ownership">
            <p>
              You retain ownership of your content. By posting, you grant Personas a non-exclusive,
              worldwide license to use, display, reproduce, and distribute your content within the platform.
            </p>
          </Section>

          <Section icon={Shield} number={7} title="Moderation and Enforcement">
            <p>
              We reserve the right to remove content, suspend or ban accounts, and review anonymous
              activity for safety and compliance.
            </p>
          </Section>

          <Section icon={MessageSquare} number={8} title="Direct Messaging">
            <p>
              Personas provides private messaging features. Messages may be stored on our servers.
              While we take reasonable measures to protect data, we do not guarantee complete security.
              Abuse via messaging may result in account suspension or termination.
            </p>
          </Section>

          <Section icon={CreditCard} number={9} title="Future Paid Features">
            <p>
              Certain features, including anonymous personas, may become part of a paid subscription
              in the future. We reserve the right to modify or restrict features.
            </p>
          </Section>

          <Section icon={Scale} number={10} title="Limitation of Liability">
            <p>
              Personas is provided &quot;as is&quot; without warranties. We are not responsible for user-generated
              content, user interactions, or any damages resulting from use of the platform.
            </p>
          </Section>

          <Section icon={LogOut} number={11} title="Termination">
            <p>
              We may suspend or terminate your account at any time for violations of these terms.
              You may stop using the platform at any time.
            </p>
          </Section>

          <Section icon={RefreshCw} number={12} title="Changes to Terms">
            <p>
              We may update these Terms and Conditions at any time. Continued use of the platform
              constitutes acceptance of the updated terms.
            </p>
          </Section>

          <Section icon={Mail} number={13} title="Contact">
            <p>
              For any questions, contact us at:{' '}
              <a href="mailto:contactpersonas247@gmail.com" className="text-primary font-medium hover:underline">
                contactpersonas247@gmail.com
              </a>
            </p>
          </Section>
        </div>

        {/* Footer */}
        <div className="mt-10 border-t pt-6 text-center text-xs text-muted-foreground">
          <p>
            Also see our{' '}
            <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}