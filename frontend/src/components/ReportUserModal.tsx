import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";

interface ReportUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

const ReportUserModal: React.FC<ReportUserModalProps> = ({
  isOpen,
  onClose,
  userId,
  userName
}) => {
  const { toast } = useToast();
  const [selectedReason, setSelectedReason] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reportReasons = [
    { value: 'fake_cv', label: 'CV i rremë ose informacion i falsifikuar' },
    { value: 'inappropriate_content', label: 'Përmbajtje e papërshtatshme në profil' },
    { value: 'suspicious_profile', label: 'Profil i dyshimtë ose mashtrues' },
    { value: 'spam_behavior', label: 'Sjellje spam ose të padëshiruar' },
    { value: 'impersonation', label: 'Personifikim i dikujt tjetër' },
    { value: 'harassment', label: 'Ngacmim ose sjellje abuzive' },
    { value: 'fake_job_posting', label: 'Njoftim pune i rremë' },
    { value: 'unprofessional_behavior', label: 'Sjellje joprofesionale' },
    { value: 'other', label: 'Arsye tjetër' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedReason) {
      toast({
        title: "Gabim",
        description: "Ju lutemi zgjidhni një arsye për raportimin",
        variant: "destructive"
      });
      return;
    }

    setSubmitting(true);

    try {
      const { reportsApi } = await import('@/lib/api');

      const response = await reportsApi.submitReport({
        reportedUserId: userId,
        category: selectedReason,
        description: additionalNotes || `Raportim për ${selectedReason}`,
        evidence: [] // Future: add file upload support
      });

      if (response.success) {
        toast({
          title: "Raportimi u dërgua",
          description: response.message || `Faleminderit për raportimin. Ekipi ynë do ta shqyrtojë sa më shpejt.`,
        });

        // Reset form and close modal
        setSelectedReason('');
        setAdditionalNotes('');
        onClose();
      } else {
        throw new Error(response.message || 'Failed to submit report');
      }

    } catch (error: any) {
      console.error('Error submitting report:', error);

      let errorMessage = "Nuk mund të dërgohet raportimi. Ju lutemi provoni përsëri.";

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Gabim",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setSelectedReason('');
      setAdditionalNotes('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Raporto Përdorues
          </DialogTitle>
          <p className="text-muted-foreground">
            Raporto <strong>{userName}</strong> për sjellje të papërshtatshme
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label className="text-base font-medium">
              Çfarë problemi keni vërejtur?
            </Label>
            <RadioGroup
              value={selectedReason}
              onValueChange={setSelectedReason}
              className="mt-3"
            >
              {reportReasons.map((reason) => (
                <div key={reason.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={reason.value} id={reason.value} />
                  <Label htmlFor={reason.value} className="cursor-pointer">
                    {reason.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="notes">
              Detaje shtesë (opsionale)
            </Label>
            <Textarea
              id="notes"
              placeholder="Shtoni detaje shtesë për raportimin tuaj..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              className="mt-2"
              rows={4}
            />
          </div>

          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1"
            >
              {submitting ? 'Duke dërguar...' : 'Dërgo Raportimin'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
            >
              Anulo
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ReportUserModal;