import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Lock, AlertCircle, Briefcase, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { login, isLoading, error, clearError, isAuthenticated, user } = useAuth();

  const isRegisterPage = location.pathname === '/register';

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      const from = location.state?.from?.pathname ||
                   (user.userType === 'admin' ? '/admin' :
                    user.userType === 'employer' ? '/employer-dashboard' : '/profile');
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, user, navigate, location]);

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
      
      const success = await login(formData.email.trim(), formData.password);

      if (success) {
        toast({
          title: "Mirësevini!",
          description: "Jeni kyçur me sukses.",
        });
      }
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isRegisterPage) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] py-12 pt-12">
          <div className="w-full max-w-md">
            <Card>
              <CardHeader className="text-center space-y-2">
                <CardTitle className="text-2xl">Regjistrohu</CardTitle>
                <CardDescription>
                  Zgjidh llojin e llogarisë për të vazhduar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Link to="/jobseekers" className="block">
                  <Card className="hover:border-primary transition-colors cursor-pointer">
                    <CardContent className="flex items-center gap-4 p-6">
                      <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Punëkërkues</h3>
                        <p className="text-sm text-muted-foreground">Kërko punë dhe apliko online</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
                <Link to="/employer-register" className="block">
                  <Card className="hover:border-primary transition-colors cursor-pointer">
                    <CardContent className="flex items-center gap-4 p-6">
                      <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                        <Briefcase className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Punëdhënës</h3>
                        <p className="text-sm text-muted-foreground">Posto vende pune dhe gjej kandidatë</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
                <div className="text-center text-sm pt-2">
                  <span className="text-muted-foreground">Ke tashmë llogari? </span>
                  <Link to="/login" className="text-primary hover:underline font-medium">
                    Kyçu këtu
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] py-12 pt-12">
        <div className="w-full max-w-md">
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="text-center space-y-2">
              <CardTitle className="text-2xl">Kyçu</CardTitle>
              <CardDescription>
                Vendos kredencialet për të vazhduar
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
                  <div className="mt-4 text-center text-sm space-y-2">
                    <p className="text-muted-foreground">Nuk ke llogari? Regjistrohu si:</p>
                    <div className="flex items-center justify-center gap-4">
                      <Link to="/jobseekers" className="text-primary hover:underline font-medium">
                        Punëkërkues
                      </Link>
                      <span className="text-muted-foreground">|</span>
                      <Link to="/employers" className="text-primary hover:underline font-medium">
                        Punëdhënës
                      </Link>
                    </div>
                  </div>
                  <div className="mt-3 text-center">
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-muted-foreground hover:text-primary"
                    >
                      Ke harruar fjalëkalimin?
                    </button>
                  </div>

                  {showForgotPassword && (
                    <Alert className="mt-4">
                      <Mail className="h-4 w-4" />
                      <AlertDescription>
                        Për të rivendosur fjalëkalimin, na kontaktoni në{' '}
                        <a href="mailto:support@advance.al" className="text-primary hover:underline font-medium">
                          support@advance.al
                        </a>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

        </div>
      </div>
    </div>
  );
};

export default Login;