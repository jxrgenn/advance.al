import { motion } from "motion/react";
import { Container } from "@mantine/core";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Briefcase, Building2, Users, TrendingUp, ChevronDown } from "lucide-react";

export function Companies() {
  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="w-full relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />
        <motion.div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(circle at 20% 50%, hsl(220 85% 25% / 0.1) 0%, transparent 50%)",
          }}
          animate={{
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(circle at 80% 50%, hsl(220 85% 25% / 0.15) 0%, transparent 50%)",
          }}
          animate={{
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
        
        {/* Decorative blobs */}
        <motion.div
          className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            x: [0, 50, 0],
            y: [0, -30, 0],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 left-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.3, 1],
            x: [0, -40, 0],
            y: [0, 40, 0],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="px-4 sm:px-6 lg:px-8">
          <Container size="lg" px={0} className="relative !pt-12 md:!pt-16 !pb-4 md:!pb-8">
            <div className="grid md:grid-cols-[1.2fr_1fr] gap-8 md:gap-12 items-center">
            {/* Left content */}
            <motion.div 
              className="space-y-6 z-10 relative"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div
                className="space-y-4 text-center md:text-left"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.8 }}
              >
                <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight text-foreground">
                  Gjeni kandidatin tuaj shpejtë, lehtë dhe në mënyrë të sigurt!
                </h2>
              </motion.div>
              
              <motion.p 
                className="text-lg md:text-xl text-primary font-semibold text-center md:text-left"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.8 }}
              >
                Teknologji moderne | Procedura të thjeshta | Rezultate të shkëlqyera
              </motion.p>
              
              <motion.p 
                className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-xl font-medium text-center md:text-left mx-auto md:mx-0"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.8 }}
              >
                Pozicionet tuaja të lira duhet të jenë aty ku mijëra kandidatë i shohin ato cdo ditë.
              </motion.p>
              
              <motion.div 
                className="flex flex-wrap gap-4 pt-4 justify-center md:justify-start"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.8 }}
              >
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button 
                    size="lg" 
                    className="text-base md:text-lg px-8 py-7 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-2xl hover:shadow-primary/30 transition-all duration-300 group relative overflow-hidden"
                    asChild
                  >
                    <Link to="/employers/post-job" className="relative z-10 flex items-center">
                      <Briefcase className="mr-2 h-5 w-5 group-hover:rotate-12 transition-transform duration-300" />
                      Posto nje pune
                      <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
                    </Link>
                  </Button>
                </motion.div>
              </motion.div>
            </motion.div>
            
            {/* Right illustration with glassmorphism card */}
            <motion.div 
              className="flex justify-center items-center relative"
              initial={{ opacity: 0, scale: 0.8, x: 50 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Rotating profession images - no border, bigger on desktop */}
              <div className="relative w-full max-w-[320px] md:max-w-[480px] h-[320px] md:h-[480px]">
                {['/3d_assets/worker1.png', '/3d_assets/doctor1.png', '/3d_assets/lawyer1.png'].map((src, index) => (
                  <img
                    key={src}
                    src={src}
                    alt={`Professional ${index + 1}`}
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{
                      opacity: 0,
                      animation: `carouselFade 9s infinite`,
                      animationDelay: `${index * 3}s`,
                      animationFillMode: 'forwards',
                    }}
                    loading="eager"
                  />
                ))}
                <style>{`
                  @keyframes carouselFade {
                    0% { opacity: 0; }
                    5% { opacity: 1; }
                    28% { opacity: 1; }
                    33%, 100% { opacity: 0; }
                  }
                `}</style>
              </div>
            </motion.div>
          </div>
          </Container>
        </div>
      </section>

      {/* Stats and Info Section */}
      <section className="w-full relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-muted/30 to-primary/5" />
        <motion.div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(circle at 80% 30%, hsl(220 85% 25% / 0.15) 0%, transparent 50%)",
          }}
          animate={{
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(circle at 20% 70%, hsl(220 85% 25% / 0.12) 0%, transparent 50%)",
          }}
          animate={{
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
        
        {/* Decorative blobs */}
        <motion.div
          className="absolute top-0 left-0 w-96 h-96 bg-primary/15 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            x: [0, -50, 0],
            y: [0, 30, 0],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 right-0 w-80 h-80 bg-primary/8 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.3, 1],
            x: [0, 40, 0],
            y: [0, -40, 0],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="px-4 sm:px-6 lg:px-8">
          <Container size="lg" px={0} className="relative !pt-8 md:!pt-12 !pb-12 md:!pb-16">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-start">
            {/* Left Column */}
            <div className="space-y-6 md:space-y-8 z-10 relative">
              {/* Title moved to left */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
              >
                <h3 className="text-4xl md:text-5xl font-extrabold mb-4 text-foreground">
                  Bashkohu me elitën!
                </h3>
                <p className="text-2xl text-muted-foreground mb-8">
                  Kompanitë lider janë të gjitha këtu.
                </p>
              </motion.div>

              {/* Two Cards in Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <motion.div 
                  className="bg-background/60 backdrop-blur-sm border border-primary/10 p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <h3 className="text-xl font-bold mb-3 text-foreground">
                    Gjeni kandidatët më të mirë për kompaninë tuaj.
                  </h3>
                  <p className="text-muted-foreground">
                    Postime të thjeshta, menaxhim shumë i lehtë, rezultate të shkëlqyera.
                  </p>
                </motion.div>

                <motion.div 
                  className="bg-background/60 backdrop-blur-sm border border-primary/10 p-6 rounded-2xl flex flex-col items-center justify-center text-center gap-3 shadow-lg hover:shadow-xl transition-shadow"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="bg-primary/10 rounded-full w-20 h-20 flex items-center justify-center shadow-md border border-primary/20">
                    <span className="text-3xl font-bold text-primary">92%</span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    E punojnësve do ta merrin në konsideratë ndryshimin e punës nëse do të kontaktoheshin nga një kompani me reputacion shumë të mirë
                  </p>
                </motion.div>
              </div>

              {/* Single Card Below */}
              <motion.div 
                className="bg-gradient-to-br from-primary to-primary/80 p-8 rounded-2xl flex items-start gap-6 text-primary-foreground shadow-2xl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6 }}
                whileHover={{ scale: 1.02 }}
              >
                <div className="bg-background/20 rounded-full w-24 h-24 flex items-center justify-center shadow-md flex-shrink-0 border border-primary-foreground/20">
                  <span className="text-4xl font-bold text-primary-foreground">75%</span>
                </div>
                <div className="pt-2">
                  <p className="text-lg font-medium">
                    E kandidatëve do të aplikonin për punë të një kompani me markë të konsoliduar, e regjjistruar dhe të verifikuar.
                  </p>
                  <p className="text-lg mt-2 font-medium">
                    Regjistrohu si kompani, rrit besueshmërinë.
                  </p>
                </div>
              </motion.div>
            </div>

            {/* Right Column - Image aligned with cards */}
            <div className="flex flex-col justify-start z-10 relative">
              {/* 3D Visual Element with glassmorphism - aligned with cards */}
              {/* Group image - no border, breathing only */}
              <motion.img 
                src="/3d_assets/group1.png" 
                alt="Elite companies - diverse team" 
                className="w-full h-auto relative z-10 mt-[60px] md:mt-[40px]"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ 
                  opacity: 1,
                  scale: [1, 1.03, 1]
                }}
                transition={{ 
                  opacity: { delay: 0.4, duration: 0.8 },
                  scale: { duration: 3, repeat: Infinity, ease: "easeInOut" }
                }}
              />
            </div>
          </div>

          {/* Scroll down element */}
          <motion.div 
            className="flex flex-col items-center justify-center mt-12 md:mt-16 z-10 relative"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            <motion.button
              onClick={() => {
                const formSection = document.querySelector('[data-employer-form]');
                if (formSection) {
                  formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              className="flex flex-col items-center gap-3 text-muted-foreground hover:text-primary transition-colors group"
            >
              <span className="text-lg md:text-xl font-semibold">Regjistrohu si punëdhënës</span>
              <motion.div
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <ChevronDown className="w-8 h-8 group-hover:text-primary transition-colors" />
              </motion.div>
            </motion.button>
          </motion.div>
          </Container>
        </div>
      </section>
    </div>
  );
}