import { Button } from "@/components/ui/button";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Briefcase, User, Building, LogOut, Settings, Bell, Shield, Bookmark, Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { notificationsApi, Notification } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import logo from "../assets/punLogo.jpeg";

const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedNotificationId, setExpandedNotificationId] = useState<string | null>(null);

  // Prevent page shift when dropdowns open
  useEffect(() => {
    const observer = new MutationObserver(() => {
      // Remove any padding-right that gets added to body
      if (document.body.style.paddingRight) {
        document.body.style.paddingRight = '';
      }
      // Remove overflow hidden that might be added
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = '';
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style']
    });

    return () => observer.disconnect();
  }, []);

  // Load notifications when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      loadUnreadCount();
    }
  }, [isAuthenticated, user]);

  const loadUnreadCount = async () => {
    try {
      const response = await notificationsApi.getUnreadCount();
      
      if (response.success && response.data) {
        setUnreadCount(response.data.unreadCount);
}
    } catch (error: any) {
      console.error('❌ Error loading unread count:', error);
    }
  };

  const loadNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const response = await notificationsApi.getNotifications({ limit: 10 });
      
      if (response.success && response.data) {
        setNotifications(response.data.notifications);
        setUnreadCount(response.data.unreadCount);
} else {
}
    } catch (error: any) {
      console.error('❌ Error loading notifications:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të ngarkohen njoftimet",
        variant: "destructive"
      });
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const response = await notificationsApi.markAsRead(notificationId);
      
      if (response.success) {
        // Update local state
        setNotifications(prev => prev.map(n => 
          n._id === notificationId ? { ...n, read: true, readAt: new Date().toISOString() } : n
        ));
        
        // Update unread count
        setUnreadCount(prev => Math.max(0, prev - 1));
        
}
    } catch (error: any) {
      console.error('❌ Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const response = await notificationsApi.markAllAsRead();
      
      if (response.success) {
        // Update local state
        setNotifications(prev => prev.map(n => ({ ...n, read: true, readAt: new Date().toISOString() })));
        setUnreadCount(0);
        
        toast({
          title: "Njoftimet u shënuan si të lexuara",
          description: `${response.data?.modifiedCount || 0} njoftimet u përditësuan`,
        });
      }
    } catch (error: any) {
      console.error('❌ Error marking all notifications as read:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të shënohen njoftimet si të lexuara",
        variant: "destructive"
      });
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const getUserInitials = (firstName?: string, lastName?: string): string => {
    if (!firstName || !lastName) return "U";
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getDashboardPath = () => {
    if (user?.userType === "admin") return "/admin";
    if (user?.userType === "employer") return "/employer-dashboard";
    return "/profile";
  };

  const handlePostJobClick = (e: React.MouseEvent) => {
    e.preventDefault();

    // If not authenticated, redirect to employers page
    if (!isAuthenticated || !user) {
      navigate("/employers");
      return;
    }

    // If authenticated but not an employer, show error and redirect to employers page
    if (user.userType !== "employer") {
      toast({
        title: "Qasje e refuzuar",
        description: "Vetëm punëdhënësit mund të postojnë punë. Regjistrohuni si punëdhënës për të vazhduar.",
        variant: "destructive"
      });
      navigate("/employers");
      return;
    }

    // If employer, redirect to post-job page
    navigate("/post-job");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-[9998] w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container relative flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center">
          <img
            src={logo}
            alt="Logo"
            className="h-12 w-12 object-contain"
          />
        </Link>

        <div className="hidden md:flex items-center space-x-6 absolute left-1/2 -translate-x-1/2">
          <Link
            to="/about"
            className={`text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/about" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Rreth Nesh
          </Link>
          <Link
            to="/employers"
            className={`text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/employers" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Punëdhenes
          </Link>
          <Link
            to="/jobseekers"
            className={`text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/jobseekers" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Punëkërkues
          </Link>
          <Link
            to="/companies"
            className={`text-sm font-medium transition-colors hover:text-primary ${
              location.pathname === "/companies" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Kompanite
          </Link>
        </div>

        <div className="flex items-center space-x-2">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          {isAuthenticated && user ? (
            <div className="flex items-center space-x-2">
              {/* Notifications Bell */}
              <DropdownMenu
                open={notificationsOpen}
                onOpenChange={(open) => {
setNotificationsOpen(open);
                  if (open) {
loadNotifications();
                  }
                }}
                modal={false}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="relative"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                      >
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80 max-h-96 overflow-y-auto mt-2" align="end">
                  <div className="flex items-center justify-between p-2">
                    <DropdownMenuLabel>Njoftimet</DropdownMenuLabel>
                    {notifications.length > 0 && unreadCount > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs" 
                        onClick={handleMarkAllAsRead}
                      >
                        Shëno të gjitha si të lexuara
                      </Button>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  
                  {loadingNotifications ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Duke ngarkuar njoftimet...
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Nuk keni njoftime të reja
                    </div>
                  ) : (
                    notifications.map((notification) => {
                      const isExpanded = expandedNotificationId === notification._id;
                      return (
                        <DropdownMenuItem
                          key={notification._id}
                          className={`p-3 cursor-pointer ${!notification.read ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                          onClick={() => {
                            if (!notification.read) {
                              handleMarkAsRead(notification._id);
                            }
                            setExpandedNotificationId(isExpanded ? null : notification._id);
                          }}
                          onSelect={(e) => e.preventDefault()}
                        >
                          <div className="flex flex-col space-y-1 w-full">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium leading-none">
                                {notification.title}
                              </p>
                              {!notification.read && (
                                <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                              )}
                            </div>
                            <p className={`text-xs text-muted-foreground whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-2'}`}>
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {notification.timeAgo}
                            </p>
                          </div>
                        </DropdownMenuItem>
                      );
                    })
                  )}
                  
                  {notifications.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-center text-sm text-primary cursor-pointer"
                        onClick={() => {
                          setNotificationsOpen(false);
                          // TODO: Navigate to full notifications page if we create one
                        }}
                      >
                        Shiko të gjitha njoftimet
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-sm">
                        {getUserInitials(user?.profile?.firstName || '', user?.profile?.lastName || '')}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 mt-2" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {user?.profile?.firstName || ''} {user?.profile?.lastName || ''}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email || ''}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {user?.userType !== "admin" && (
                    <DropdownMenuItem asChild>
                      <Link to={getDashboardPath()} className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        <span>{user?.userType === "employer" ? "Dashboard" : "Profili Im"}</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {user?.userType === "jobseeker" && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link to="/saved-jobs" className="cursor-pointer">
                          <Bookmark className="mr-2 h-4 w-4" />
                          <span>Punët e Ruajtura</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/profile" className="cursor-pointer">
                          <Settings className="mr-2 h-4 w-4" />
                          <span>Cilësimet</span>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  {user?.userType === "admin" && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="cursor-pointer">
                        <Shield className="mr-2 h-4 w-4" />
                        <span>Paneli Admin</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleLogout}
                    className="cursor-pointer text-red-600 focus:text-red-600"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Dil</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {user?.userType === "employer" && (
                <Button size="sm" asChild>
                  <Link to="/employer-dashboard">
                    <Building className="mr-2 h-4 w-4" />
                    Dashboard
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link to="/login">
                  <User className="mr-2 h-4 w-4" />
                  Hyrje
                </Link>
              </Button>
              <Button size="sm" onClick={handlePostJobClick}>
                <Building className="mr-2 h-4 w-4" />
                Posto Punë
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <div className="container py-4 space-y-3">
            <Link
              to="/about"
              className={`block py-2 text-sm font-medium transition-colors hover:text-primary ${
                location.pathname === "/about" ? "text-primary" : "text-muted-foreground"
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Rreth Nesh
            </Link>
            <Link
              to="/employers"
              className={`block py-2 text-sm font-medium transition-colors hover:text-primary ${
                location.pathname === "/employers" ? "text-primary" : "text-muted-foreground"
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Punëdhenes
            </Link>
            <Link
              to="/jobseekers"
              className={`block py-2 text-sm font-medium transition-colors hover:text-primary ${
                location.pathname === "/jobseekers" ? "text-primary" : "text-muted-foreground"
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Punëkërkues
            </Link>
            <Link
              to="/companies"
              className={`block py-2 text-sm font-medium transition-colors hover:text-primary ${
                location.pathname === "/companies" ? "text-primary" : "text-muted-foreground"
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Kompanite
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navigation;