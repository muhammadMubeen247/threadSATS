import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Database, UserSearch, Activity, EyeOff, MessageSquare, Share2, Lock, Clock, UserCog, Cookie, RefreshCw, Mail } from 'lucide-react';
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

function InfoChip({ icon: Icon, label }) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
      <span>{label}</span>
    </li>
  );
}

export default function PrivacyPolicyPage() {
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
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: March 19, 2026
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          <Section icon={Database} number={1} title="Introduction">
            <p>
              This Privacy Policy explains how Personas collects, uses, and protects your information.
              By using the platform, you agree to the practices described in this policy.
            </p>
          </Section>

          <Section icon={UserSearch} number={2} title="Information We Collect">
            <div className="space-y-3">
              <div className="rounded-lg border bg-background/50 p-3">
                <p className="text-xs font-semibold text-foreground mb-1.5">a) Account Information</p>
                <ul className="list-disc pl-5 space-y-0.5 text-xs">
                  <li>University email (registration number)</li>
                  <li>Username</li>
                  <li>Profile information</li>
                </ul>
              </div>
              <div className="rounded-lg border bg-background/50 p-3">
                <p className="text-xs font-semibold text-foreground mb-1.5">b) User Activity</p>
                <ul className="list-disc pl-5 space-y-0.5 text-xs">
                  <li>Posts, comments, likes, and follows</li>
                  <li>Interactions with content</li>
                  <li>Direct messages</li>
                </ul>
              </div>
              <div className="rounded-lg border bg-background/50 p-3">
                <p className="text-xs font-semibold text-foreground mb-1.5">c) Technical Data</p>
                <ul className="list-disc pl-5 space-y-0.5 text-xs">
                  <li>IP address</li>
                  <li>Browser and device information</li>
                  <li>Session/authentication data (via JWT or cookies)</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section icon={Activity} number={3} title="How We Use Information">
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide and maintain the platform</li>
              <li>Enable social interactions</li>
              <li>Personalize feeds and trends</li>
              <li>Detect and prevent abuse</li>
              <li>Enforce Terms and Conditions</li>
            </ul>
          </Section>

          <Section icon={EyeOff} number={4} title="Anonymous Persona">
            <p>
              Personas allows users to interact anonymously.
              Anonymous content is not publicly linked to your identity.
            </p>
            <p>
              However, anonymous activity may still be internally associated with your account for:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Moderation</li>
              <li>Security</li>
              <li>Legal compliance</li>
            </ul>
          </Section>

          <Section icon={MessageSquare} number={5} title="Direct Messages">
            <p>
              Direct messages are stored on our servers to provide messaging functionality.
            </p>
            <p>
              While we take reasonable measures to protect your data:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Messages are not end-to-end encrypted</li>
              <li>We cannot guarantee complete security of communications</li>
            </ul>
          </Section>

          <Section icon={Share2} number={6} title="Data Sharing">
            <p>We do <strong className="text-foreground">not</strong> sell your personal data.</p>
            <p>We may share information:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>If required by law</li>
              <li>To protect users and platform integrity</li>
              <li>To prevent fraud, abuse, or illegal activity</li>
            </ul>
          </Section>

          <Section icon={Lock} number={7} title="Data Security">
            <p>
              We implement reasonable security measures to protect your data.
              However, no system is completely secure, and we cannot guarantee absolute protection.
            </p>
          </Section>

          <Section icon={Clock} number={8} title="Data Retention">
            <p>
              We retain your data as long as necessary to provide services, comply with legal obligations,
              and resolve disputes.
            </p>
            <p>
              Data may be retained even after account deletion for legal or security reasons.
            </p>
          </Section>

          <Section icon={UserCog} number={9} title="Your Rights">
            <ul className="list-disc pl-5 space-y-1">
              <li>Request access to your data</li>
              <li>Request account deletion</li>
              <li>Update your information</li>
            </ul>
          </Section>

          <Section icon={Cookie} number={10} title="Cookies and Authentication">
            <p>
              We use technologies such as JWT and cookies to authenticate users and maintain sessions.
            </p>
          </Section>

          <Section icon={RefreshCw} number={11} title="Changes to This Policy">
            <p>
              We may update this Privacy Policy at any time. Continued use of the platform indicates
              acceptance of changes.
            </p>
          </Section>

          <Section icon={Mail} number={12} title="Contact">
            <p>
              For privacy-related concerns, contact:{' '}
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
            <Link to="/terms" className="text-primary hover:underline">Terms &amp; Conditions</Link>
          </p>
        </div>
      </div>
    </div>
  );
}