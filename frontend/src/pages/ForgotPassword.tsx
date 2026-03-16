import { useState } from "react";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mail } from "lucide-react";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast({
        title: "Gabim",
        description: "Ju lutemi vendosni adresën tuaj të emailit.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";
      await fetch(`${apiUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      // Always show success message for security (don't reveal if email exists)
      toast({
        title: "Email u dërgua",
        description:
          "Nëse kjo adresë emaili ekziston në sistemin tonë, do të merrni një link për rivendosjen e fjalëkalimit.",
      });
      setEmail("");
    } catch {
      toast({
        title: "Gabim",
        description: "Ndodhi një gabim. Ju lutemi provoni përsëri më vonë.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] py-12 pt-12">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center space-y-2">
              <CardTitle className="text-2xl">Rivendos Fjalëkalimin</CardTitle>
              <CardDescription>
                Vendosni emailin tuaj dhe do t'ju dërgojmë një link për të rivendosur fjalëkalimin.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="andi.krasniqi@email.com"
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Duke dërguar..." : "Dërgo Linkun e Rivendosjes"}
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

export default ForgotPassword;
