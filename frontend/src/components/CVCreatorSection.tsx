import { motion } from "motion/react";
import { Container } from "@mantine/core";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, Sparkles, Clock, Gift } from "lucide-react";

export function CVCreatorSection() {
  return (
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
        <Container size="lg" px={0} className="relative !pt-4 md:!pt-6 !pb-6 md:!pb-8">
          <div className="grid md:grid-cols-[1.2fr_1fr] gap-6 md:gap-8 items-center">
          {/* Image - shown first on mobile, aligned with top component */}
          <motion.div 
            className="flex justify-center md:justify-start items-center relative order-2 md:order-1"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* CV character - no border, breathing only */}
            <motion.img 
              src="/3d_assets/cv_character.jpg" 
              alt="CV creation illustration" 
              className="w-full max-w-[360px] md:max-w-[480px] lg:max-w-[560px] h-auto relative z-10"
              animate={{ 
                scale: [1, 1.03, 1]
              }}
              transition={{ 
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </motion.div>
          
          {/* Content - shown second on mobile */}
          <motion.div 
            className="space-y-3 md:space-y-4 z-10 relative order-1 md:order-2"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              className="space-y-2 text-center md:text-left"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold leading-[1.1] tracking-tight">
                <span className="block text-foreground">KURSE KOHE.</span>
                <motion.span
                  className="block bg-gradient-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5, duration: 0.6 }}
                >
                KRIJO CV TUAJ ME NDIHMEN E IA TANI!
                </motion.span>
              </h2>
            </motion.div>
            
            <motion.p 
              className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl text-center md:text-left mx-auto md:mx-0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
            >
              Përshkruani në mënyrë të natyrshme aftësitë tuaja dhe IA do të krijojë CV tuaj profesionale në pak minuta.
            </motion.p>
            
            <motion.div 
              className="space-y-3 pt-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex justify-center md:justify-start">
                <Button 
                  size="lg" 
                  className="text-base md:text-lg px-6 md:px-8 py-5 md:py-6 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-2xl hover:shadow-primary/30 transition-all duration-300 group relative overflow-hidden"
                  asChild
                >
                  <Link to="/jobseekers#ai-cv-section" className="relative z-10 flex items-center">
                    <FileText className="mr-2 h-4 w-4 md:h-5 md:w-5 group-hover:rotate-12 transition-transform duration-300" />
                    Krijo CV me IA
                    <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5 group-hover:translate-x-1 transition-transform duration-300" />
                  </Link>
                </Button>
              </motion.div>
              
              {/* Feature badges inline below button */}
              <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start">
                <motion.div 
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background/60 backdrop-blur-sm border border-primary/10 shadow-sm"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8 }}
                  whileHover={{ scale: 1.05 }}
                >
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs md:text-sm font-semibold text-foreground">2 minuta</span>
                </motion.div>
                <motion.div 
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background/60 backdrop-blur-sm border border-primary/10 shadow-sm"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.9 }}
                  whileHover={{ scale: 1.05 }}
                >
                  <Gift className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs md:text-sm font-semibold text-foreground">100% Falas</span>
                </motion.div>
                <motion.div 
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background/60 backdrop-blur-sm border border-primary/10 shadow-sm"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.0 }}
                  whileHover={{ scale: 1.05 }}
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs md:text-sm font-semibold text-foreground">AI Powered</span>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        </div>
        </Container>
      </div>
    </section>
  );
}