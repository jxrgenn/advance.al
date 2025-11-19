import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Navigation from "@/components/Navigation";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { authApi } from "@/lib/api";
import {
  Users,
  CheckCircle,
  Play,
  ArrowRight,
  ArrowLeft,
  Phone,
  Mail,
  Shield,
  Clock
} from "lucide-react";

interface FormData {
  step1: {
    companyName: string;
    industry: string;
    companySize: string;
    city: string;
    website: string;
  };
  step2: {
    email: string;
    phone: string;
    contactPerson: string;
    verificationMethod: 'email' | 'phone' | '';
    verificationCode: string;
  };
  step3: {
    password: string;
    confirmPassword: string;
    termsAccepted: boolean;
    marketingOptIn: boolean;
  };
}

const EmployersPage = () => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    step1: {
      companyName: '',
      industry: '',
      companySize: '',
      city: '',
      website: ''
    },
    step2: {
      email: '',
      phone: '',
      contactPerson: '',
      verificationMethod: '',
      verificationCode: ''
    },
    step3: {
      password: '',
      confirmPassword: '',
      termsAccepted: false,
      marketingOptIn: false
    }
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isVerificationSent, setIsVerificationSent] = useState(false);

  const updateFormData = (step: keyof FormData, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [step]: {
        ...prev[step],
        [field]: value
      }
    }));
  };

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.step1.companyName.trim()) newErrors.companyName = 'Emri i kompanisë është i detyrueshëm';
    if (!formData.step1.industry) newErrors.industry = 'Industria është e detyrueshme';
    if (!formData.step1.companySize) newErrors.companySize = 'Madhësia e kompanisë është e detyrueshme';
    if (!formData.step1.city.trim()) newErrors.city = 'Qyteti është i detyrueshëm';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.step2.email.trim()) newErrors.email = 'Email-i është i detyrueshëm';
    if (!formData.step2.phone.trim()) newErrors.phone = 'Telefoni është i detyrueshëm';
    if (!formData.step2.contactPerson.trim()) newErrors.contactPerson = 'Personi i kontaktit është i detyrueshëm';
    if (!formData.step2.verificationMethod) newErrors.verificationMethod = 'Zgjidhni metodën e verifikimit';

    // If verification code was sent, require it to be entered
    if (isVerificationSent && !formData.step2.verificationCode.trim()) {
      newErrors.verificationCode = 'Shkruani kodin e verifikimit';
    }

    // If verification code is entered, validate it
    if (isVerificationSent && formData.step2.verificationCode.trim()) {
      const storedCode = sessionStorage.getItem('verificationCode');
      if (formData.step2.verificationCode !== storedCode) {
        newErrors.verificationCode = 'Kodi i verifikimit është i gabuar';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep3 = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.step3.password.trim()) newErrors.password = 'Fjalëkalimi është i detyrueshëm';
    if (formData.step3.password.length < 6) newErrors.password = 'Fjalëkalimi duhet të ketë të paktën 6 karaktere';
    if (formData.step3.password !== formData.step3.confirmPassword) newErrors.confirmPassword = 'Fjalëkalimet nuk përputhen';
    if (!formData.step3.termsAccepted) newErrors.terms = 'Duhet të pranoni kushtet dhe rregullat';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = async () => {
    let isValid = false;

    switch (currentStep) {
      case 1:
        isValid = validateStep1();
        break;
      case 2:
        isValid = validateStep2();
        break;
      case 3:
        isValid = validateStep3();
        break;
    }

    if (isValid) {
      if (currentStep < 3) {
        setCurrentStep(currentStep + 1);
      } else {
        // Submit final registration to Formcarry
        await submitRegistration();
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const submitRegistration = async () => {
    try {
      console.log('🚀 Creating employer account...');

      // Extract name from contact person (assuming "First Last" format)
      const nameParts = formData.step2.contactPerson.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Prepare registration data for the auth API
      const registrationData = {
        email: formData.step2.email,
        password: formData.step3.password,
        userType: 'employer' as const,
        firstName: firstName,
        lastName: lastName,
        city: formData.step1.city,
        phone: formData.step2.phone,
        companyName: formData.step1.companyName,
        industry: formData.step1.industry,
        companySize: formData.step1.companySize
      };

      console.log('📤 Sending registration data:', registrationData);
      console.log('📋 Form data breakdown:', {
        step1: formData.step1,
        step2: formData.step2,
        step3: { ...formData.step3, password: '[HIDDEN]' }
      });

      const response = await authApi.register(registrationData);

      if (response.success) {
        toast({
          title: "Llogaria u krijua!",
          description: "Llogaria juaj u krijua me sukses. Tani mund të postoni punë.",
        });
        console.log('✅ Employer account created successfully');

        // Reset form and redirect to dashboard or home
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        throw new Error(response.message || 'Failed to create account');
      }
    } catch (error: any) {
      console.error('❌ Error creating employer account:', error);
      console.error('❌ Error response:', error.response);

      let errorMessage = "Nuk mund të krijohet llogaria. Ju lutemi provoni përsëri.";

      if (error.response && error.response.errors) {
        // Show specific validation errors
        const errorDetails = error.response.errors.map((err: any) => `${err.field}: ${err.message}`).join(', ');
        errorMessage = `Gabime validimi: ${errorDetails}`;
        console.error('❌ Validation errors:', error.response.errors);
      }

      toast({
        title: "Gabim",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const sendVerificationCode = async () => {
    try {
      console.log('🚀 Sending verification code via Resend...');

      const identifier = formData.step2.verificationMethod === 'email'
        ? formData.step2.email
        : formData.step2.phone;

      // Only send emails for now (SMS would need different service)
      if (formData.step2.verificationMethod !== 'email') {
        toast({
          title: "Vetëm Email",
          description: "Momentalisht mbështesim vetëm verifikim me email.",
          variant: "destructive"
        });
        return;
      }

      // Generate a 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Send email via Resend API
      const emailResponse = await fetch('http://localhost:3001/api/send-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: identifier,
          companyName: formData.step1.companyName,
          contactPerson: formData.step2.contactPerson,
          verificationCode: verificationCode
        })
      });

      if (emailResponse.ok) {
        setIsVerificationSent(true);
        toast({
          title: "Kodi u dërgua!",
          description: `Kodi i verifikimit u dërgua në ${identifier}. Kontrolloni email-in tuaj.`,
        });
        console.log('✅ Verification code sent successfully to:', identifier);

        // Store the code temporarily for verification
        sessionStorage.setItem('verificationCode', verificationCode);
        sessionStorage.setItem('verificationIdentifier', identifier);
      } else {
        throw new Error('Failed to send verification email');
      }
    } catch (error: any) {
      console.error('❌ Error sending verification code:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të dërgojmë kodin e verifikimit. Ju lutemi provoni përsëri.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Compact Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 via-primary/5 to-background py-8">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              Gjej Kandidatin Perfekt
              <span className="text-primary block">për Kompaninë Tënde</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Me advance.al, gjeni kandidatët më të mirë në Shqipëri. Proces i thjeshtë, rezultate të garantuara.
            </p>
          </div>

          {/* Compact Benefits */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4">
              <Users className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <h3 className="font-semibold">Kandidatë Cilësorë</h3>
            </div>
            <div className="text-center p-4">
              <Clock className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <h3 className="font-semibold">Rezultate të Shpejta</h3>
            </div>
            <div className="text-center p-4">
              <Shield className="h-8 w-8 text-purple-600 mx-auto mb-2" />
              <h3 className="font-semibold">100% i Sigurt</h3>
            </div>
          </div>
        </div>
      </section>

      {/* Compact Tutorial Section */}
      <section className="py-6 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">
              Si të Postosh një Punë
            </h2>
            <div className="flex justify-center">
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-6 py-3"
                onClick={() => window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank')}
              >
                <Play className="mr-2 h-5 w-5" />
                Shiko Video Tutorial (2 min)
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Compact Pricing */}
      <section className="py-6 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-6">
            Çmimet Tona
          </h2>
          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            <Card className="p-4 bg-background">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">28 EUR</div>
                <p className="text-sm">Postim Normal • 16 ditë</p>
              </div>
            </Card>
            <Card className="p-4 bg-primary text-white">
              <div className="text-center">
                <div className="text-2xl font-bold">42 EUR</div>
                <p className="text-sm">Postim Sponsor • Përparësi</p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Registration Form Section */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              Krijoni Llogarinë Tuaj
            </h2>
            <p className="text-lg text-muted-foreground">
              Vetëm 3 hapa të thjeshtë
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            {/* Progress Indicator */}
            <div className="flex items-center justify-center mb-8">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border-2 ${
                      step === currentStep
                        ? 'bg-primary text-primary-foreground border-primary'
                        : step < currentStep
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-background text-muted-foreground border-muted-foreground/30'
                    }`}
                  >
                    {step < currentStep ? (
                      <CheckCircle className="h-6 w-6" />
                    ) : (
                      step
                    )}
                  </div>
                  {step < 3 && (
                    <div
                      className={`w-16 h-1 mx-2 ${
                        step < currentStep ? 'bg-green-600' : 'bg-muted-foreground/30'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            <Card className="p-8">
              {/* Step 1: Company Information */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold mb-2">Informacione mbi Kompaninë</h3>
                    <p className="text-muted-foreground">Na tregoni për kompaninë tuaj</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="companyName" className="text-lg">Emri i Kompanisë *</Label>
                      <Input
                        id="companyName"
                        value={formData.step1.companyName}
                        onChange={(e) => updateFormData('step1', 'companyName', e.target.value)}
                        placeholder="Shkruani emrin e kompanisë"
                        className="mt-2 text-lg p-6"
                      />
                      {errors.companyName && <p className="text-red-600 text-sm mt-1">{errors.companyName}</p>}
                    </div>

                    <div>
                      <Label htmlFor="industry" className="text-lg">Industria *</Label>
                      <Select onValueChange={(value) => updateFormData('step1', 'industry', value)}>
                        <SelectTrigger className="mt-2 text-lg p-6">
                          <SelectValue placeholder="Zgjidhni industrinë" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="teknologji">Teknologji</SelectItem>
                          <SelectItem value="financë">Financë</SelectItem>
                          <SelectItem value="shëndetësi">Shëndetësi</SelectItem>
                          <SelectItem value="arsim">Arsim</SelectItem>
                          <SelectItem value="ndërtim">Ndërtim</SelectItem>
                          <SelectItem value="turizëm">Turizëm</SelectItem>
                          <SelectItem value="tjetër">Tjetër</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.industry && <p className="text-red-600 text-sm mt-1">{errors.industry}</p>}
                    </div>

                    <div>
                      <Label htmlFor="companySize" className="text-lg">Madhësia e Kompanisë *</Label>
                      <Select onValueChange={(value) => updateFormData('step1', 'companySize', value)}>
                        <SelectTrigger className="mt-2 text-lg p-6">
                          <SelectValue placeholder="Zgjidhni madhësinë" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1-10">1-10 punonjës</SelectItem>
                          <SelectItem value="11-50">11-50 punonjës</SelectItem>
                          <SelectItem value="51-200">51-200 punonjës</SelectItem>
                          <SelectItem value="200+">200+ punonjës</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.companySize && <p className="text-red-600 text-sm mt-1">{errors.companySize}</p>}
                    </div>

                    <div>
                      <Label htmlFor="city" className="text-lg">Qyteti *</Label>
                      <Input
                        id="city"
                        value={formData.step1.city}
                        onChange={(e) => updateFormData('step1', 'city', e.target.value)}
                        placeholder="Shkruani qytetin"
                        className="mt-2 text-lg p-6"
                      />
                      {errors.city && <p className="text-red-600 text-sm mt-1">{errors.city}</p>}
                    </div>

                    <div>
                      <Label htmlFor="website" className="text-lg">Website (opsional)</Label>
                      <Input
                        id="website"
                        value={formData.step1.website}
                        onChange={(e) => updateFormData('step1', 'website', e.target.value)}
                        placeholder="https://kompania-ime.com"
                        className="mt-2 text-lg p-6"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Contact & Verification */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold mb-2">Kontakti dhe Verifikimi</h3>
                    <p className="text-muted-foreground">Verifikojmë që jeni një kompani e vërtetë</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="email" className="text-lg">Email i Kompanisë *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.step2.email}
                        onChange={(e) => updateFormData('step2', 'email', e.target.value)}
                        placeholder="info@kompania-ime.com"
                        className="mt-2 text-lg p-6"
                      />
                      {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <Label htmlFor="phone" className="text-lg">Telefoni i Kompanisë *</Label>
                      <Input
                        id="phone"
                        value={formData.step2.phone}
                        onChange={(e) => updateFormData('step2', 'phone', e.target.value)}
                        placeholder="+355 69 123 4567"
                        className="mt-2 text-lg p-6"
                      />
                      {errors.phone && <p className="text-red-600 text-sm mt-1">{errors.phone}</p>}
                    </div>

                    <div>
                      <Label htmlFor="contactPerson" className="text-lg">Personi i Kontaktit *</Label>
                      <Input
                        id="contactPerson"
                        value={formData.step2.contactPerson}
                        onChange={(e) => updateFormData('step2', 'contactPerson', e.target.value)}
                        placeholder="Emri dhe mbiemri"
                        className="mt-2 text-lg p-6"
                      />
                      {errors.contactPerson && <p className="text-red-600 text-sm mt-1">{errors.contactPerson}</p>}
                    </div>

                    <div>
                      <Label className="text-lg">Si dëshironi të verifikoheni? *</Label>
                      <div className="grid md:grid-cols-2 gap-4 mt-3">
                        <Card
                          className={`p-4 cursor-pointer border-2 transition-colors ${
                            formData.step2.verificationMethod === 'email' ? 'border-primary bg-primary/10' : 'border-muted'
                          }`}
                          onClick={() => updateFormData('step2', 'verificationMethod', 'email')}
                        >
                          <div className="flex items-center space-x-3">
                            <Mail className="h-6 w-6 text-primary" />
                            <div>
                              <h4 className="font-semibold">Me Email</h4>
                              <p className="text-sm text-muted-foreground">Kod 6-shifror në email</p>
                            </div>
                          </div>
                        </Card>

                        <Card
                          className={`p-4 cursor-pointer border-2 transition-colors ${
                            formData.step2.verificationMethod === 'phone' ? 'border-primary bg-primary/10' : 'border-muted'
                          }`}
                          onClick={() => updateFormData('step2', 'verificationMethod', 'phone')}
                        >
                          <div className="flex items-center space-x-3">
                            <Phone className="h-6 w-6 text-primary" />
                            <div>
                              <h4 className="font-semibold">Me SMS</h4>
                              <p className="text-sm text-muted-foreground">Kod 6-shifror në telefon</p>
                            </div>
                          </div>
                        </Card>
                      </div>
                      {errors.verificationMethod && <p className="text-red-600 text-sm mt-1">{errors.verificationMethod}</p>}
                    </div>

                    {formData.step2.verificationMethod && (
                      <div>
                        <Button
                          onClick={sendVerificationCode}
                          disabled={isVerificationSent}
                          className="w-full text-lg p-6"
                        >
                          {isVerificationSent ? 'Kodi u Dërgua!' : `Dërgo Kod ${formData.step2.verificationMethod === 'email' ? 'në Email' : 'në SMS'}`}
                        </Button>
                      </div>
                    )}

                    {isVerificationSent && (
                      <div>
                        <Label htmlFor="verificationCode" className="text-lg">Shkruani Kodin 6-shifror *</Label>
                        <Input
                          id="verificationCode"
                          value={formData.step2.verificationCode}
                          onChange={(e) => updateFormData('step2', 'verificationCode', e.target.value)}
                          placeholder="123456"
                          maxLength={6}
                          className="mt-2 text-lg p-6 text-center text-2xl"
                        />
                        {errors.verificationCode && <p className="text-red-600 text-sm mt-1">{errors.verificationCode}</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Account Setup */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold mb-2">Përfundoni Llogarinë</h3>
                    <p className="text-muted-foreground">Vetëm pak detaje të fundit</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="password" className="text-lg">Fjalëkalimi *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.step3.password}
                        onChange={(e) => updateFormData('step3', 'password', e.target.value)}
                        placeholder="Të paktën 6 karaktere"
                        className="mt-2 text-lg p-6"
                      />
                      {errors.password && <p className="text-red-600 text-sm mt-1">{errors.password}</p>}
                    </div>

                    <div>
                      <Label htmlFor="confirmPassword" className="text-lg">Konfirmo Fjalëkalimin *</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={formData.step3.confirmPassword}
                        onChange={(e) => updateFormData('step3', 'confirmPassword', e.target.value)}
                        placeholder="Shkruani përsëri fjalëkalimin"
                        className="mt-2 text-lg p-6"
                      />
                      {errors.confirmPassword && <p className="text-red-600 text-sm mt-1">{errors.confirmPassword}</p>}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          id="terms"
                          checked={formData.step3.termsAccepted}
                          onChange={(e) => updateFormData('step3', 'termsAccepted', e.target.checked)}
                          className="mt-1 h-5 w-5"
                        />
                        <Label htmlFor="terms" className="text-base leading-relaxed">
                          Unë pranoj <Link to="/terms" className="text-primary underline">Kushtet dhe Rregullat</Link> dhe <Link to="/privacy" className="text-primary underline">Politikën e Privatësisë</Link> të advance.al *
                        </Label>
                      </div>
                      {errors.terms && <p className="text-red-600 text-sm">{errors.terms}</p>}

                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          id="marketing"
                          checked={formData.step3.marketingOptIn}
                          onChange={(e) => updateFormData('step3', 'marketingOptIn', e.target.checked)}
                          className="mt-1 h-5 w-5"
                        />
                        <Label htmlFor="marketing" className="text-base leading-relaxed">
                          Dëshiroj të marr email për këshilla rekrutimi dhe funksione të reja (opsionale)
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between items-center mt-8 pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={currentStep === 1}
                  className="text-lg px-8 py-6"
                >
                  <ArrowLeft className="mr-2 h-5 w-5" />
                  Mbrapa
                </Button>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Hapi {currentStep} nga 3
                  </p>
                </div>

                <Button
                  onClick={handleNext}
                  className="text-lg px-8 py-6"
                >
                  {currentStep === 3 ? 'Krijo Llogari' : 'Vazhdo'}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
};

export default EmployersPage;