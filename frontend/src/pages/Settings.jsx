import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import ChangePasswordPanel from '@/components/settings/ChangePasswordPanel';
import BlockedPersonasPanel from '@/components/settings/BlockedPersonasPanel';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowLeft, Lock, UserX, FileText, Shield } from 'lucide-react';

export default function Settings() {
  const [activeKey, setActiveKey] = useState(null);
  const navigate = useNavigate();

  const sections = useMemo(
    () => [
      {
        groupTitle: 'Account',
        items: [
          {
            key: 'change-password',
            title: 'Update password',
            description: 'Change your account password.',
            icon: Lock,
          },
          {
            key: 'blocked-personas',
            title: 'Blocked profiles',
            description: 'View and manage blocked profiles.',
            icon: UserX,
          },
        ],
      },
      {
        groupTitle: 'Legal',
        items: [
          {
            key: 'terms',
            title: 'Terms & Conditions',
            description: 'Read our terms of service.',
            icon: FileText,
            href: '/terms',
          },
          {
            key: 'privacy',
            title: 'Privacy Policy',
            description: 'Learn how we handle your data.',
            icon: Shield,
            href: '/privacy',
          },
        ],
      },
    ],
    []
  );

  const DefaultPane = () => {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Choose a category on the left to view and update your preferences.
          </CardDescription>
        </CardHeader>

        {/* <CardContent>
          <div className="grid gap-6 md:grid-cols-[1fr_16rem] items-start">
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                From here you can manage account-related options such as:
              </div>

              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Update your password</li>
                <li>See blocked personas</li>
                <li>More options in future</li>
              </ul>
            </div>
          </div>
        </CardContent> */}
      </Card>
    );
  };

  const ActivePane = () => {
    switch (activeKey) {
      case 'change-password':
        return <ChangePasswordPanel />;
      case 'blocked-personas':
        return <BlockedPersonasPanel />;
      default:
        return <DefaultPane />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[16rem_22rem_1fr]">
          {/* Left: App sidebar */}
          <div className="hidden lg:block">
            <Sidebar />
          </div>

          {/* Middle: Settings categories — hidden on mobile when a panel is active */}
          <div className={cn('space-y-4', activeKey && 'hidden lg:block')}>
            <div>
              <h1 className="text-2xl font-bold">Settings</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage your account preferences.
              </p>
            </div>

            {sections.map((group) => (
              <Card key={group.groupTitle}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{group.groupTitle}</CardTitle>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.key === activeKey;

                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => item.href ? navigate(item.href) : setActiveKey(item.key)}
                          className={cn(
                            'w-full rounded-md px-3 py-3 text-left transition-colors',
                            'hover:bg-accent',
                            isActive && 'bg-accent'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{item.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {item.description}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Right: Active panel — on mobile takes full width and shows back button */}
          <div className={cn('min-w-0 space-y-3', !activeKey && 'hidden lg:block')}>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setActiveKey(null)}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            </div>

            <ActivePane />
          </div>
        </div>
      </div>
    </div>
  );
}