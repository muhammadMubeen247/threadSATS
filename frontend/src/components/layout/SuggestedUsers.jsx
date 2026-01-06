import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useState } from 'react';

export default function SuggestedUsers() {
  // Dummy data for now
  const [suggestedUsers] = useState([
    {
      id: '1',
      username: 'ahmed_dev',
      department: 'Computer Science',
      batch: 'FA22',
      profilePic: '',
    },
    {
      id: '2',
      username: 'sara_coder',
      department: 'Software Engineering',
      batch: 'SP23',
      profilePic: '',
    },
    {
      id: '3',
      username: 'ali_tech',
      department: 'Information Technology',
      batch: 'FA23',
      profilePic: '',
    },
  ]);

  const [followedUsers, setFollowedUsers] = useState([]);

  const handleFollow = (userId) => {
    setFollowedUsers([...followedUsers, userId]);
    // TODO: Call API later
  };

  const getInitials = (username) => {
    return username?.substring(0, 2).toUpperCase() || 'U';
  };

  return (
    <aside className="sticky top-16 h-[calc(100vh-4rem)] w-80 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Suggested Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {suggestedUsers.map((user) => (
            <div key={user.id} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.profilePic} alt={user.username} />
                  <AvatarFallback>{getInitials(user.username)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">@{user.username}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.department} • {user.batch}
                  </p>
                </div>
              </div>
              <Button
                variant={followedUsers.includes(user.id) ? 'outline' : 'default'}
                size="sm"
                onClick={() => handleFollow(user.id)}
                disabled={followedUsers.includes(user.id)}
              >
                {followedUsers.includes(user.id) ? 'Following' : 'Follow'}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </aside>
  );
}