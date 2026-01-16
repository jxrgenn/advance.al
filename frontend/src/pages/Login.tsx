import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, Building, Mail, Lock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const Login = () => {
  const [activeTab, setActiveTab] = useState<'jobseeker' | 'employer'>('jobseeker');
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { login, isLoading, error, clearError, isAuthenticated, user } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      const from = location.state?.from?.pathname ||
                   (user.userType === 'admin' ? '/admin' :
                    user.userType === 'employer' ? '/employer-dashboard' : '/profile');
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, user, navigate, location]);

  // Clear error when switching tabs
  useEffect(() => {
    clearError();
  }, [activeTab]); // Removed clearError from deps

  // Remove the problematic useEffect entirely

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (error) {
      clearError();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return; // Prevent multiple submissions
    
    if (!formData.email.trim() || !formData.password.trim()) {
      toast({
        title: "Gabim",
        description: "Ju lutemi plotësoni të gjitha fushat",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);
      clearError();
      
      await login(formData.email.trim(), formData.password);
      
      // Check the result after login attempt
      setTimeout(() => {
        if (isAuthenticated) {
          toast({
            title: "Mirësevini!",
            description: "Jeni kyçur me sukses.",
          });
        } else if (error) {
          toast({
            title: "Gabim në kyçje",
            description: error,
            variant: "destructive"
          });
        }
      }, 100);
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as 'jobseeker' | 'employer');
    setFormData({ email: '', password: '' });
    clearError();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] py-8">
        <div className="w-full max-w-md">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="jobseeker" className="flex items-center">
                <User className="mr-2 h-4 w-4" />
                Kërkoj Punë
              </TabsTrigger>
              <TabsTrigger value="employer" className="flex items-center">
                <Building className="mr-2 h-4 w-4" />
                Punëdhënës
              </TabsTrigger>
            </TabsList>

            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <TabsContent value="jobseeker">
              <Card>
                <CardHeader className="text-center">
                  <CardTitle>Kyçu si Kërkues Pune</CardTitle>
                  <CardDescription>
                    Gjej punën e përshtatshme për ty
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="email"
                          name="email"
                          type="email" 
                          placeholder="andi.krasniqi@email.com"
                          className="pl-10"
                          value={formData.email}
                          onChange={handleInputChange}
                          required 
                          autoComplete="email"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Fjalëkalimi</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="password"
                          name="password"
                          type="password"
                          placeholder="password123"
                          className="pl-10"
                          value={formData.password}
                          onChange={handleInputChange}
                          required
                          autoComplete="current-password"
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting || isLoading}>
                      {(isSubmitting || isLoading) ? "Duke u kyçur..." : "Kyçu"}
                    </Button>
                  </form>
                  <div className="mt-4 text-center text-sm">
                    <span className="text-muted-foreground">Nuk ke llogari? </span>
                    <Link to="/register" className="text-primary hover:underline">
                      Regjistrohu
                    </Link>
                  </div>
                  <div className="mt-2 text-center">
                    <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
                      Ke harruar fjalëkalimin?
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="employer">
              <Card>
                <CardHeader className="text-center">
                  <CardTitle>Kyçu si Punëdhënës</CardTitle>
                  <CardDescription>
                    Menaxho punët dhe aplikuesit
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="employer-email">Email i Kompanisë</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="employer-email"
                          name="email"
                          type="email" 
                          placeholder="klajdi@techinnovations.al"
                          className="pl-10"
                          value={formData.email}
                          onChange={handleInputChange}
                          required
                          autoComplete="email"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="employer-password">Fjalëkalimi</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="employer-password"
                          name="password"
                          type="password"
                          placeholder="password123"
                          className="pl-10"
                          value={formData.password}
                          onChange={handleInputChange}
                          required
                          autoComplete="current-password"
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting || isLoading}>
                      {(isSubmitting || isLoading) ? "Duke u kyçur..." : "Kyçu"}
                    </Button>
                  </form>
                  <div className="mt-4 text-center">
                    <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
                      Ke harruar fjalëkalimin?
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Demo Account Info */}
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h3 className="text-sm font-medium mb-2">Llogari Test:</h3>
            <div className="text-xs space-y-1 text-muted-foreground">
              <p><strong>Kërkues Pune:</strong> andi.krasniqi@email.com / password123</p>
              <p><strong>Kërkues Pune:</strong> sara.marku@email.com / password123</p>
              <p><strong>Punëdhënës:</strong> klajdi@techinnovations.al / password123</p>
              <p><strong>Punëdhënës:</strong> admin@digitalfuture.al / password123</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;