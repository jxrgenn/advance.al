import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

const NotFound = () => {
  return (
    <>
      <Navigation />
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="mb-4 text-6xl font-bold text-gray-300">404</h1>
          <p className="mb-2 text-2xl font-semibold text-foreground">Faqja nuk u gjet</p>
          <p className="mb-6 text-gray-500">Faqja që po kërkoni nuk ekziston ose është zhvendosur.</p>
          <a href="/" className="text-blue-500 underline hover:text-blue-700">
            Kthehu në faqen kryesore
          </a>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default NotFound;
