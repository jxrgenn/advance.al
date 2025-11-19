import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import Navigation from "@/components/Navigation";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { authApi, quickUsersApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import {
  Users,
  Star,
  Zap,
  Shield,
  Clock,
  CheckCircle,
  Play,
  ArrowRight,
  Briefcase,
  Bell,
  Search,
  MessageSquare,
  BarChart3,
  Upload,
  Mail,
  Smartphone
} from "lucide-react";

const JobSeekersPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { register: authRegister } = useAuth();
  const [selectedPathway, setSelectedPathway] = useState<'full' | 'quick' | null>(null);
  const [loading, setLoading] = useState(false);
  const [quickFormData, setQuickFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    interests: [] as string[]
  });
  const [fullFormData, setFullFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    password: ''
  });

  const jobCategories = [
    'Teknologji',
    'Marketing',
    'Shitje',
    'Financë',
    'Burime Njerëzore',
    'Inxhinieri',
    'Dizajn',
    'Menaxhim',
    'Shëndetësi',
    'Arsim',
    'Turizëm',
    'Ndërtim',
    'Transport',
    'Tjetër'
  ];

  const handleQuickInterestToggle = (interest: string) => {
    setQuickFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  const handleQuickSubmit = async () => {
    const missingFields = [];
    if (!quickFormData.firstName) missingFields.push('Emri');
    if (!quickFormData.lastName) missingFields.push('Mbiemri');
    if (!quickFormData.email) missingFields.push('Email-i');
    if (!quickFormData.phone || quickFormData.phone.trim() === '') missingFields.push('Numri i telefonit');
    if (!quickFormData.city) missingFields.push('Qyteti');
    if (quickFormData.interests.length === 0) missingFields.push('Të paktën një interes');

    if (missingFields.length > 0) {
      toast({
        title: "Fusha të paplotësuara",
        description: `Ju lutemi plotësoni: ${missingFields.join(', ')}`,
        variant: "destructive"
      });
      return;
    }

    // Parse and format phone number
    const cleaned = quickFormData.phone.replace(/[\s\-\(\)]/g, '');

    // Check minimum length (8 digits)
    const digitsOnly = cleaned.replace(/^\+/, '').replace(/^00/, '');
    if (digitsOnly.length < 8) {
      toast({
        title: "Gabim",
        description: "Numri i telefonit është shumë i shkurtër",
        variant: "destructive"
      });
      return;
    }

    let cleanPhone;
    // Handle specific formats
    if (cleaned.startsWith('00')) {
      // 00 prefix becomes +
      cleanPhone = '+' + cleaned.substring(2);
    } else if (cleaned.match(/^06[6-9]/)) {
      // Albanian mobile: 06x becomes +355 6x
      cleanPhone = '+355' + cleaned.substring(1);
    } else if (!cleaned.startsWith('+')) {
      // Add + if missing
      cleanPhone = '+' + cleaned;
    } else {
      // Already has +
      cleanPhone = cleaned;
    }

    try {
      setLoading(true);
      const response = await quickUsersApi.createQuickUser({
        firstName: quickFormData.firstName,
        lastName: quickFormData.lastName,
        email: quickFormData.email,
        phone: cleanPhone,
        city: quickFormData.city,
        interests: quickFormData.interests
      });

      if (response.success) {
        toast({
          title: "Sukses!",
          description: "Regjistrimi u krye me sukses! Do të filloni të merrni njoftime për punë të reja."
        });

        // Reset form
        setQuickFormData({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          city: '',
          interests: []
        });
        setSelectedPathway(null);
      }
    } catch (error: any) {
      console.error('Quick signup error:', error);

      let errorMessage = "Nuk mund të bëhet regjistrimi. Ju lutemi provoni përsëri.";

      // Check if we have specific validation errors
      if (error.response?.errors && Array.isArray(error.response.errors)) {
        const errorMessages = error.response.errors.map((err: any) => {
          return `${err.field}: ${err.message}`;
        });
        errorMessage = errorMessages.join(', ');
      } else if (error.response?.message) {
        errorMessage = error.response.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Gabim në Regjistrimin e Shpejtë",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFullSubmit = async () => {
    const missingFields = [];
    if (!fullFormData.firstName) missingFields.push('Emri');
    if (!fullFormData.lastName) missingFields.push('Mbiemri');
    if (!fullFormData.email) missingFields.push('Email-i');
    if (!fullFormData.phone || fullFormData.phone.trim() === '') missingFields.push('Numri i telefonit');
    if (!fullFormData.city) missingFields.push('Qyteti');
    if (!fullFormData.password) missingFields.push('Fjalëkalimi');

    if (missingFields.length > 0) {
      toast({
        title: "Fusha të paplotësuara",
        description: `Ju lutemi plotësoni: ${missingFields.join(', ')}`,
        variant: "destructive"
      });
      return;
    }

    if (fullFormData.password.length < 6) {
      toast({
        title: "Gabim",
        description: "Fjalëkalimi duhet të ketë të paktën 6 karaktere.",
        variant: "destructive"
      });
      return;
    }

    // Parse and format phone number
    const cleaned = fullFormData.phone.replace(/[\s\-\(\)]/g, '');

    // Check minimum length (8 digits)
    const digitsOnly = cleaned.replace(/^\+/, '').replace(/^00/, '');
    if (digitsOnly.length < 8) {
      toast({
        title: "Gabim",
        description: "Numri i telefonit është shumë i shkurtër",
        variant: "destructive"
      });
      return;
    }

    let cleanPhone;
    // Handle specific formats
    if (cleaned.startsWith('00')) {
      // 00 prefix becomes +
      cleanPhone = '+' + cleaned.substring(2);
    } else if (cleaned.match(/^06[6-9]/)) {
      // Albanian mobile: 06x becomes +355 6x
      cleanPhone = '+355' + cleaned.substring(1);
    } else if (!cleaned.startsWith('+')) {
      // Add + if missing
      cleanPhone = '+' + cleaned;
    } else {
      // Already has +
      cleanPhone = cleaned;
    }

    try {
      setLoading(true);

      // Use the auth context register function
      await authRegister({
        email: fullFormData.email,
        password: fullFormData.password,
        userType: 'jobseeker',
        firstName: fullFormData.firstName,
        lastName: fullFormData.lastName,
        phone: cleanPhone,
        city: fullFormData.city
      });

      toast({
        title: "Mirë se vini!",
        description: "Llogaria u krijua me sukses! Jeni kyçur automatikisht."
      });

      // Redirect to profile page after successful authentication
      navigate('/profile');
    } catch (error: any) {
      console.error('Full signup error:', error);

      let errorMessage = "Nuk mund të krijohet llogaria. Ju lutemi provoni përsëri.";

      // Check if we have specific validation errors
      if (error.response?.errors && Array.isArray(error.response.errors)) {
        const errorMessages = error.response.errors.map((err: any) => {
          return `${err.field}: ${err.message}`;
        });
        errorMessage = errorMessages.join(', ');
      } else if (error.response?.message) {
        errorMessage = error.response.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Gabim në Krijimin e Llogarisë",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Compact Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 via-indigo-50 to-background py-8">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              Gjej Punën e
              <span className="text-primary block">Ëndrrave Tuaja</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Platforma më e lehtë dhe më efikase për të gjetur punë në Shqipëri.
            </p>
          </div>

          {/* Compact Benefits */}
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3">
              <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <h3 className="font-semibold text-sm">100% Falas</h3>
            </div>
            <div className="text-center p-3">
              <Zap className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <h3 className="font-semibold text-sm">Aplikim i Shpejtë</h3>
            </div>
            <div className="text-center p-3">
              <Bell className="h-8 w-8 text-purple-600 mx-auto mb-2" />
              <h3 className="font-semibold text-sm">Njoftime Automatike</h3>
            </div>
            <div className="text-center p-3">
              <Shield className="h-8 w-8 text-orange-600 mx-auto mb-2" />
              <h3 className="font-semibold text-sm">Të Dhëna të Sigurta</h3>
            </div>
          </div>
        </div>
      </section>

      {/* Compact Tutorial Section */}
      <section className="py-6 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">
              Si të Aplikosh për Punë
            </h2>
            <div className="flex justify-center">
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-6 py-3"
                onClick={() => window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank')}
              >
                <Play className="mr-2 h-5 w-5" />
                Shiko Video Tutorial (3 min)
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Dual Pathway Section - The Main Feature */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Zgjidhni Mënyrën që ju Përshtatet
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
              Kemi dy mënyra të thjeshta për t'ju ndihmuar të gjeni punë.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
            {/* Left Side: Full Account Creation */}
            <Card className={`p-8 border-2 transition-all duration-300 ${selectedPathway === 'full' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'}`}>
              <CardHeader className="text-center p-0 mb-8">
                <div className="bg-primary/10 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center mb-4">
                  <Users className="h-10 w-10 text-primary" />
                </div>
                <CardTitle className="text-2xl mb-3">Llogari e Plotë</CardTitle>
                <p className="text-muted-foreground text-lg">
                  Për të gjitha funksionet dhe kontrollin e plotë
                </p>
              </CardHeader>

              <CardContent className="space-y-6 p-0">
                {/* Benefits of Full Account */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <CheckCircle className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg">Aplikim me Një Klik</h4>
                      <p className="text-sm text-muted-foreground">Aplikoni për punë pa plotësuar forma të gjata</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <Briefcase className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg">Menaxhimi i Aplikimeve</h4>
                      <p className="text-sm text-muted-foreground">Shikoni statusin e të gjitha aplikimeve tuaja</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg">Komunikim Direkt</h4>
                      <p className="text-sm text-muted-foreground">Flisni direkt me punëdhënësit</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <Upload className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg">CV dhe Dokumente</h4>
                      <p className="text-sm text-muted-foreground">Ruani CV dhe dokumentet tuaja</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <BarChart3 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg">Statistika Karriere</h4>
                      <p className="text-sm text-muted-foreground">Shikoni progresin dhe analizat tuaja</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <Search className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg">Kërkime të Ruajtura</h4>
                      <p className="text-sm text-muted-foreground">Ruani kërkesat tuaja të preferuara</p>
                    </div>
                  </div>
                </div>

                {/* Benefits Bar */}
                <div className="mt-6 p-4 bg-background rounded-lg border">
                  <div className="flex items-center justify-center space-x-6 text-sm">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-muted-foreground" />
                      <span>100% Falas</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      <span>Kontrolli i Plotë</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Star className="h-4 w-4 text-muted-foreground" />
                      <span>Të Gjitha Funksionet</span>
                    </div>
                  </div>
                </div>

                {/* Full Account Form */}
                {selectedPathway === 'full' && (
                  <div className="space-y-4 pt-6 border-t">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="fullFirstName" className="text-base">Emri *</Label>
                        <Input
                          id="fullFirstName"
                          value={fullFormData.firstName}
                          onChange={(e) => setFullFormData(prev => ({ ...prev, firstName: e.target.value }))}
                          placeholder="Emri juaj"
                          className="mt-2 text-base p-4"
                        />
                      </div>
                      <div>
                        <Label htmlFor="fullLastName" className="text-base">Mbiemri *</Label>
                        <Input
                          id="fullLastName"
                          value={fullFormData.lastName}
                          onChange={(e) => setFullFormData(prev => ({ ...prev, lastName: e.target.value }))}
                          placeholder="Mbiemri juaj"
                          className="mt-2 text-base p-4"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="fullEmail" className="text-base">Email *</Label>
                      <Input
                        id="fullEmail"
                        type="email"
                        value={fullFormData.email}
                        onChange={(e) => setFullFormData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="email@tuaj.com"
                        className="mt-2 text-base p-4"
                      />
                    </div>

                    <div>
                      <Label htmlFor="fullPhone" className="text-base">Telefoni</Label>
                      <Input
                        id="fullPhone"
                        value={fullFormData.phone}
                        onChange={(e) => setFullFormData(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+355 69 123 4567"
                        className="mt-2 text-base p-4"
                      />
                    </div>

                    <div>
                      <Label htmlFor="fullCity" className="text-base">Qyteti *</Label>
                      <Select value={fullFormData.city} onValueChange={(value) => setFullFormData(prev => ({ ...prev, city: value }))}>
                        <SelectTrigger className="mt-2 text-base p-4">
                          <SelectValue placeholder="Zgjidhni qytetin" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tirane">Tiranë</SelectItem>
                          <SelectItem value="durres">Durrës</SelectItem>
                          <SelectItem value="vlore">Vlorë</SelectItem>
                          <SelectItem value="shkoder">Shkodër</SelectItem>
                          <SelectItem value="korce">Korçë</SelectItem>
                          <SelectItem value="elbasan">Elbasan</SelectItem>
                          <SelectItem value="fier">Fier</SelectItem>
                          <SelectItem value="berat">Berat</SelectItem>
                          <SelectItem value="tjeter">Tjetër</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="fullPassword" className="text-base">Fjalëkalimi *</Label>
                      <Input
                        id="fullPassword"
                        type="password"
                        value={fullFormData.password}
                        onChange={(e) => setFullFormData(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Të paktën 6 karaktere"
                        className="mt-2 text-base p-4"
                      />
                    </div>

                    <Button
                      onClick={handleFullSubmit}
                      disabled={loading}
                      className="w-full text-lg py-6 mt-6"
                      size="lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Duke krijuar...
                        </>
                      ) : (
                        <>
                          Krijo Llogari të Plotë
                          <ArrowRight className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {selectedPathway !== 'full' && (
                  <Button
                    onClick={() => setSelectedPathway('full')}
                    variant="outline"
                    className="w-full text-lg py-6 mt-6"
                    size="lg"
                  >
                    Zgjidh Llogarinë e Plotë
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Right Side: Quick Notification Signup */}
            <Card className={`p-8 border-2 transition-all duration-300 ${selectedPathway === 'quick' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'}`}>
              <CardHeader className="text-center p-0 mb-8">
                <div className="bg-primary/10 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center mb-4">
                  <Bell className="h-10 w-10 text-primary" />
                </div>
                <CardTitle className="text-2xl mb-3">Setup i Lehtë</CardTitle>
                <p className="text-muted-foreground text-lg">
                  Merrni njoftime për punë të reja
                </p>
                <Badge variant="secondary" className="mt-3">
                  ⚡ 2 Minuta
                </Badge>
              </CardHeader>

              <CardContent className="space-y-6 p-0">
                {/* Visual Process Steps */}
                <div className="bg-muted/30 p-6 rounded-lg border">
                  <h3 className="text-lg font-semibold text-center mb-6">
                    Si Funksionon - 3 Hapa të Thjeshtë
                  </h3>

                  <div className="space-y-4">
                    <div className="flex items-center space-x-4">
                      <div className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                        1
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">Regjistrohuni</span>
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-primary font-medium">2 min</span>
                        </div>
                        <p className="text-sm text-muted-foreground">Emri, email dhe lloji i punës</p>
                      </div>
                    </div>

                    <div className="border-l-2 border-muted ml-4 h-4"></div>

                    <div className="flex items-center space-x-4">
                      <div className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                        2
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">Merrni Email</span>
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-primary font-medium">Automatik</span>
                        </div>
                        <p className="text-sm text-muted-foreground">Kur ka punë të reja për ju</p>
                      </div>
                    </div>

                    <div className="border-l-2 border-muted ml-4 h-4"></div>

                    <div className="flex items-center space-x-4">
                      <div className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                        3
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">Aplikoni</span>
                          <CheckCircle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-primary font-medium">1 Klik</span>
                        </div>
                        <p className="text-sm text-muted-foreground">Direkt nga email-i</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-background rounded-lg border">
                    <div className="flex items-center justify-center space-x-6 text-sm">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-muted-foreground" />
                        <span>100% Falas</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <span>Zero Stress</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Star className="h-4 w-4 text-muted-foreground" />
                        <span>Vetëm Punë Relevante</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Signup Form */}
                {selectedPathway === 'quick' && (
                  <div className="space-y-4 pt-6 border-t">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="quickFirstName" className="text-base">Emri *</Label>
                        <Input
                          id="quickFirstName"
                          value={quickFormData.firstName}
                          onChange={(e) => setQuickFormData(prev => ({ ...prev, firstName: e.target.value }))}
                          placeholder="Emri juaj"
                          className="mt-2 text-base p-4"
                        />
                      </div>
                      <div>
                        <Label htmlFor="quickLastName" className="text-base">Mbiemri *</Label>
                        <Input
                          id="quickLastName"
                          value={quickFormData.lastName}
                          onChange={(e) => setQuickFormData(prev => ({ ...prev, lastName: e.target.value }))}
                          placeholder="Mbiemri juaj"
                          className="mt-2 text-base p-4"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="quickEmail" className="text-base">Email *</Label>
                      <Input
                        id="quickEmail"
                        type="email"
                        value={quickFormData.email}
                        onChange={(e) => setQuickFormData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="email@tuaj.com"
                        className="mt-2 text-base p-4"
                      />
                    </div>

                    <div>
                      <Label htmlFor="quickPhone" className="text-base">Telefoni (për SMS)</Label>
                      <Input
                        id="quickPhone"
                        value={quickFormData.phone}
                        onChange={(e) => setQuickFormData(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+355 69 123 4567 (opsionale)"
                        className="mt-2 text-base p-4"
                      />
                    </div>

                    <div>
                      <Label htmlFor="quickCity" className="text-base">Qyteti *</Label>
                      <Select onValueChange={(value) => setQuickFormData(prev => ({ ...prev, city: value }))}>
                        <SelectTrigger className="mt-2 text-base p-4">
                          <SelectValue placeholder="Zgjidhni qytetin" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tirane">Tiranë</SelectItem>
                          <SelectItem value="durres">Durrës</SelectItem>
                          <SelectItem value="vlore">Vlorë</SelectItem>
                          <SelectItem value="shkoder">Shkodër</SelectItem>
                          <SelectItem value="korce">Korçë</SelectItem>
                          <SelectItem value="elbasan">Elbasan</SelectItem>
                          <SelectItem value="fier">Fier</SelectItem>
                          <SelectItem value="berat">Berat</SelectItem>
                          <SelectItem value="tjeter">Tjetër</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-base mb-3 block">Çfarë lloj pune kërkoni? *</Label>
                      <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                        {jobCategories.map((category) => (
                          <div key={category} className="flex items-center space-x-2">
                            <Checkbox
                              id={`interest-${category}`}
                              checked={quickFormData.interests.includes(category)}
                              onCheckedChange={() => handleQuickInterestToggle(category)}
                            />
                            <Label
                              htmlFor={`interest-${category}`}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {category}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Zgjidhni të paktën një kategori
                      </p>
                    </div>

                    <Button
                      onClick={handleQuickSubmit}
                      disabled={loading}
                      className="w-full text-lg py-6 mt-6"
                      size="lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Duke regjistruar...
                        </>
                      ) : (
                        <>
                          <Bell className="mr-2 h-5 w-5" />
                          Fillo Njoftimet
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {selectedPathway !== 'quick' && (
                  <Button
                    onClick={() => setSelectedPathway('quick')}
                    className="w-full text-lg py-6 mt-6"
                    size="lg"
                  >
                    Zgjidh Setup-in e Lehtë
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Comparison note */}
          <div className="text-center mt-12">
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              💡 <strong>Këshillë:</strong> Nëse nuk jeni të sigurt, filloni me "Njoftime për Punë" - është super e lehtë
              dhe gjithmonë mund të krijoni llogari të plotë më vonë!
            </p>
          </div>
        </div>
      </section>

      {/* Success Stories / Social Proof */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Historitë e Suksesit
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-6 bg-background">
              <CardContent className="space-y-4 p-0">
                <div className="flex items-center space-x-1 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-muted-foreground italic">
                  "U regjistrova me njoftime të shpejta dhe brenda 3 ditësh mora 5 email për punë.
                  Tani jam e punësuar në kompaninë e ëndrrave!"
                </p>
                <div className="pt-4 border-t">
                  <p className="font-semibold">Elira M.</p>
                  <p className="text-sm text-muted-foreground">Marketing Manager, Tiranë</p>
                </div>
              </CardContent>
            </Card>

            <Card className="p-6 bg-background">
              <CardContent className="space-y-4 p-0">
                <div className="flex items-center space-x-1 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-muted-foreground italic">
                  "Platforma më e lehtë që kam përdorur ndonjëherë.
                  Krijova llogari të plotë dhe u punësova brenda 2 javësh!"
                </p>
                <div className="pt-4 border-t">
                  <p className="font-semibold">Arben K.</p>
                  <p className="text-sm text-muted-foreground">Software Developer, Durrës</p>
                </div>
              </CardContent>
            </Card>

            <Card className="p-6 bg-background">
              <CardContent className="space-y-4 p-0">
                <div className="flex items-center space-x-1 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-muted-foreground italic">
                  "Njoftimet automatike janë gjeniale! Nuk më duhet të kontrolloj çdo ditë,
                  advance.al më njofton vetë."
                </p>
                <div className="pt-4 border-t">
                  <p className="font-semibold">Mirela P.</p>
                  <p className="text-sm text-muted-foreground">Accounting Specialist, Vlorë</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-16 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Gati të Filloni Karrierën e Re?
          </h2>
          <p className="text-lg md:text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Mijëra punëkërkues kanë gjetur punën e tyre të preferuar me advance.al.
            Ju jeni radhën!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              variant="secondary"
              className="text-lg px-8 py-6"
              onClick={() => setSelectedPathway('quick')}
            >
              <Bell className="mr-3 h-5 w-5" />
              Fillo me Njoftime
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-6 border-white text-white hover:bg-white hover:text-primary"
              onClick={() => setSelectedPathway('full')}
            >
              <Users className="mr-3 h-5 w-5" />
              Krijo Llogari të Plotë
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default JobSeekersPage;