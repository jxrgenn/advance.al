import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navigation from "@/components/Navigation";
import ReportUserModal from "@/components/ReportUserModal";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const ReportUser = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const userId = searchParams.get('userId');
  const userName = searchParams.get('userName') || 'Përdorues';
  const [modalOpen, setModalOpen] = useState(true);

  useEffect(() => {
    if (!userId) {
      navigate('/');
    }
  }, [userId, navigate]);

  const handleModalClose = () => {
    setModalOpen(false);
    navigate(-1); // Go back to previous page when modal closes
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container py-8 max-w-2xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kthehu
          </Button>

          <div className="text-center py-8">
            <h1 className="text-2xl font-bold mb-4">Raporto Përdorues</h1>
            <p className="text-muted-foreground">
              Modali për raportim po hapet automatikisht...
            </p>
          </div>
        </div>
      </div>

      {/* Modal opens automatically when page loads */}
      {userId && (
        <ReportUserModal
          isOpen={modalOpen}
          onClose={handleModalClose}
          userId={userId}
          userName={userName}
        />
      )}
    </div>
  );
};

export default ReportUser;