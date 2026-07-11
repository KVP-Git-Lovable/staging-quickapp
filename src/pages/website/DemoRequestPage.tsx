import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { WebsiteHeader } from "@/components/website";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Building2, 
  User, 
  Mail, 
  Phone, 
  Users, 
  MapPin, 
  CheckCircle2,
  Sparkles,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const solutions = [
  { id: "field-sales", label: "Field Sales Automation" },
  { id: "distributor-portal", label: "Distributor Portal" },
  { id: "institutional-sales", label: "Institutional Sales CRM" },
  { id: "van-sales", label: "Van Sales / Route Sales" },
  { id: "analytics", label: "Sales Analytics & Reporting" },
  { id: "gamification", label: "Team Gamification" },
];

const teamSizes = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "500+"
];

const industries = [
  "FMCG / Consumer Goods",
  "Food & Beverages",
  "Pharmaceuticals",
  "Agricultural Products",
  "Building Materials",
  "Electronics / Appliances",
  "Automotive Parts",
  "Other"
];

const formSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  phone: z.string().trim().min(10, "Phone number must be at least 10 digits").max(20),
  company: z.string().trim().min(2, "Company name is required").max(200),
  jobTitle: z.string().trim().min(2, "Job title is required").max(100),
  teamSize: z.string().min(1, "Please select team size"),
  industry: z.string().min(1, "Please select industry"),
  location: z.string().trim().min(2, "Location is required").max(200),
  solutions: z.array(z.string()).min(1, "Please select at least one solution"),
  message: z.string().trim().max(1000).optional(),
});

export default function DemoRequestPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    company: "",
    jobTitle: "",
    teamSize: "",
    industry: "",
    location: "",
    solutions: [] as string[],
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleSolutionToggle = (solutionId: string) => {
    setFormData(prev => ({
      ...prev,
      solutions: prev.solutions.includes(solutionId)
        ? prev.solutions.filter(s => s !== solutionId)
        : [...prev.solutions, solutionId]
    }));
    if (errors.solutions) {
      setErrors(prev => ({ ...prev, solutions: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    try {
      const validatedData = formSchema.parse(formData);
      
      // Simulate form submission (replace with actual API call)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      toast.success("Demo request submitted successfully!", {
        description: "Our team will contact you within 24 hours."
      });
      
      // Reset form
      setFormData({
        fullName: "",
        email: "",
        phone: "",
        company: "",
        jobTitle: "",
        teamSize: "",
        industry: "",
        location: "",
        solutions: [],
        message: "",
      });
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.issues.forEach(err => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <WebsiteHeader />
      
      {/* Hero Section */}
      <section className="pt-24 pb-12 px-4 bg-gradient-to-b from-primary/10 to-background">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 mb-6">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-primary text-sm font-medium">Free Demo • No Commitment</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Request a <span className="text-primary">Personalized Demo</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            See how Quickapp.ai can transform your field sales operations. 
            Our team will show you features tailored to your business needs.
          </p>
        </div>
      </section>

      {/* Form Section */}
      <section className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Benefits Sidebar */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-4">What you'll get:</h3>
                  <ul className="space-y-3">
                    {[
                      "Live product walkthrough",
                      "Custom use case discussion",
                      "ROI analysis for your business",
                      "Implementation roadmap",
                      "Pricing tailored to your needs",
                    ].map((benefit, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground text-sm">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-6 text-center">
                  <p className="text-2xl font-bold text-primary mb-1">30 min</p>
                  <p className="text-muted-foreground text-sm">Average demo duration</p>
                </CardContent>
              </Card>
            </div>

            {/* Form */}
            <div className="lg:col-span-2">
              <Card className="border-border/50">
                <CardContent className="p-6 md:p-8">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Contact Information */}
                    <div>
                      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                        <User className="w-5 h-5 text-primary" />
                        Contact Information
                      </h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="fullName">Full Name *</Label>
                          <Input
                            id="fullName"
                            placeholder="John Doe"
                            value={formData.fullName}
                            onChange={(e) => handleInputChange("fullName", e.target.value)}
                            className={errors.fullName ? "border-destructive" : ""}
                          />
                          {errors.fullName && (
                            <p className="text-destructive text-sm">{errors.fullName}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email">Work Email *</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="john@company.com"
                            value={formData.email}
                            onChange={(e) => handleInputChange("email", e.target.value)}
                            className={errors.email ? "border-destructive" : ""}
                          />
                          {errors.email && (
                            <p className="text-destructive text-sm">{errors.email}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone">Phone Number *</Label>
                          <Input
                            id="phone"
                            placeholder="+91 98765 43210"
                            value={formData.phone}
                            onChange={(e) => handleInputChange("phone", e.target.value)}
                            className={errors.phone ? "border-destructive" : ""}
                          />
                          {errors.phone && (
                            <p className="text-destructive text-sm">{errors.phone}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="jobTitle">Job Title *</Label>
                          <Input
                            id="jobTitle"
                            placeholder="Sales Director"
                            value={formData.jobTitle}
                            onChange={(e) => handleInputChange("jobTitle", e.target.value)}
                            className={errors.jobTitle ? "border-destructive" : ""}
                          />
                          {errors.jobTitle && (
                            <p className="text-destructive text-sm">{errors.jobTitle}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Company Information */}
                    <div>
                      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-primary" />
                        Company Information
                      </h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="company">Company Name *</Label>
                          <Input
                            id="company"
                            placeholder="ACME Corporation"
                            value={formData.company}
                            onChange={(e) => handleInputChange("company", e.target.value)}
                            className={errors.company ? "border-destructive" : ""}
                          />
                          {errors.company && (
                            <p className="text-destructive text-sm">{errors.company}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="location">Location *</Label>
                          <Input
                            id="location"
                            placeholder="Mumbai, India"
                            value={formData.location}
                            onChange={(e) => handleInputChange("location", e.target.value)}
                            className={errors.location ? "border-destructive" : ""}
                          />
                          {errors.location && (
                            <p className="text-destructive text-sm">{errors.location}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Field Team Size *</Label>
                          <select
                            value={formData.teamSize}
                            onChange={(e) => handleInputChange("teamSize", e.target.value)}
                            className={`w-full h-10 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.teamSize ? "border-destructive" : "border-input"}`}
                          >
                            <option value="">Select team size</option>
                            {teamSizes.map(size => (
                              <option key={size} value={size}>{size} people</option>
                            ))}
                          </select>
                          {errors.teamSize && (
                            <p className="text-destructive text-sm">{errors.teamSize}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Industry *</Label>
                          <select
                            value={formData.industry}
                            onChange={(e) => handleInputChange("industry", e.target.value)}
                            className={`w-full h-10 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.industry ? "border-destructive" : "border-input"}`}
                          >
                            <option value="">Select industry</option>
                            {industries.map(industry => (
                              <option key={industry} value={industry}>{industry}</option>
                            ))}
                          </select>
                          {errors.industry && (
                            <p className="text-destructive text-sm">{errors.industry}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Solutions Interest */}
                    <div>
                      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        Solutions You're Interested In *
                      </h3>
                      <div className="grid md:grid-cols-2 gap-3">
                        {solutions.map(solution => (
                          <label
                            key={solution.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                              formData.solutions.includes(solution.id)
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <Checkbox
                              checked={formData.solutions.includes(solution.id)}
                              onCheckedChange={() => handleSolutionToggle(solution.id)}
                            />
                            <span className="text-sm">{solution.label}</span>
                          </label>
                        ))}
                      </div>
                      {errors.solutions && (
                        <p className="text-destructive text-sm mt-2">{errors.solutions}</p>
                      )}
                    </div>

                    {/* Additional Message */}
                    <div className="space-y-2">
                      <Label htmlFor="message">Additional Information (Optional)</Label>
                      <Textarea
                        id="message"
                        placeholder="Tell us about your current challenges or specific requirements..."
                        value={formData.message}
                        onChange={(e) => handleInputChange("message", e.target.value)}
                        rows={4}
                      />
                    </div>

                    {/* Submit Button */}
                    <Button 
                      type="submit" 
                      size="lg" 
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        "Submitting..."
                      ) : (
                        <>
                          Request Demo
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>

                    <p className="text-center text-muted-foreground text-sm">
                      By submitting, you agree to our <a href="/privacy-policy" className="text-accent-gold hover:underline">privacy policy</a>. We'll never share your information.
                    </p>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
