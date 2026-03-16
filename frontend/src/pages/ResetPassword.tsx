import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Lock } from "lucide-react";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const token = searchParams.get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast({
        title: "Gabim",
        description: "Linku i rivendosjes është i pavlefshëm ose ka skaduar.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Gabim",
        description: "Fjalëkalimi duhet të ketë të paktën 8 karaktere.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Gabim",
        description: "Fjalëkalimet nuk përputhen.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";
      const response = await fetch(`${apiUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Ndodhi një gabim");
      }

      toast({
        title: "Fjalëkalimi u rivendos",
        description: "Fjalëkalimi juaj u ndryshua me sukses. Tani mund të kyçeni.",
      });
      navigate("/login");
    } catch (err) {
      toast({
        title: "Gabim",
        description:
          err instanceof Error
            ? err.message
            : "Ndodhi një gabim. Ju lutemi provoni përsëri më vonë.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] py-12 pt-12">
          <div className="w-full max-w-md">
            <Card>
              <CardHeader className="text-center space-y-2">
                <CardTitle className="text-2xl">Link i Pavlefshëm</CardTitle>
                <CardDescription>
                  Linku i rivendosjes së fjalëkalimit është i pavlefshëm ose ka skaduar.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Link to="/forgot-password">
                  <Button variant="outline">Kërko një link të ri</Button>
                </Link>
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
          <Card>
            <CardHeader className="text-center space-y-2">
              <CardTitle className="text-2xl">Rivendos Fjalëkalimin</CardTitle>
              <CardDescription>
                Vendosni fjalëkalimin tuaj të ri.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Fjalëkalimi i Ri</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Minimum 8 karaktere"
                      className="pl-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Konfirmo Fjalëkalimin</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Shkruaj fjalëkalimin përsëri"
                      className="pl-10"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Duke rivendosur..." : "Rivendos Fjalëkalimin"}
                </Button>
              </form>
              <div className="mt-4 text-center text-sm">
                <Link to="/login" className="text-primary hover:underline font-medium">
                  Kthehu te Kyçja
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
