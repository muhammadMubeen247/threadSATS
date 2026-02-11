import { useMemo, useState } from 'react';

import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import ChangePasswordPanel from '@/components/settings/ChangePasswordPanel';
import BlockedPersonasPanel from '@/components/settings/BlockedPersonasPanel';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowLeft, Lock, UserX } from 'lucide-react';

export default function Settings() {
  const [activeKey, setActiveKey] = useState(null);

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

  const showBackToDefault = activeKey !== null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[16rem_22rem_1fr]">
          {/* Left: App sidebar */}
          <div className="hidden lg:block">
            <Sidebar />
          </div>

          {/* Middle: Settings categories */}
          <div className="space-y-4">
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
                          onClick={() => setActiveKey(item.key)}
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

            {/* Mobile helper */}
            <div className="lg:hidden space-y-2">
              <Button variant="outline" className="w-full" onClick={() => window.history.back()}>
                Back
              </Button>

              {activeKey ? (
                <Button variant="ghost" className="w-full" onClick={() => setActiveKey(null)}>
                  Clear selection
                </Button>
              ) : null}
            </div>
          </div>

          {/* Right: Active panel */}
          <div className="min-w-0 space-y-3">
            {showBackToDefault ? (
              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => setActiveKey(null)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Go back
                </Button>
              </div>
            ) : null}

            <ActivePane />
          </div>
        </div>
      </div>
    </div>
  );
}