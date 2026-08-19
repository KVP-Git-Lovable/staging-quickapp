import { Link } from "react-router-dom";
import { Phone, BookOpen, ShieldCheck, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MadadHelpButton } from "@/components/MadadHelpButton";
import { SeedDummyDataCard } from "../components/SeedDummyDataCard";

const points = [
  { icon: Phone, title: "Calls you back", text: "Madad rings the phone number saved on your profile — nothing to dial." },
  { icon: ShieldCheck, title: "Knows your account", text: "The assistant is authenticated as you, so answers stay scoped to your data." },
  { icon: Clock, title: "Available any time", text: "Use it when a screen is unclear or a workflow is blocking your day." },
];

export default function SahayaPage() {
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold md:text-2xl">QuickApp Sahaya</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Voice-first help. Talk to Madad, our AI help assistant, or browse the help centre.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Talk to Madad</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/40 p-4">
              <MadadHelpButton />
              <div className="min-w-0">
                <p className="text-sm font-medium">Start a help call</p>
                <p className="text-xs text-muted-foreground">
                  Tap the headset. Madad will call your registered number within a few seconds.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {points.map((p) => (
                <div key={p.title} className="rounded-lg border border-border p-3">
                  <p.icon className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-sm font-medium">{p.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" />
              Help Centre
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Prefer reading? Every Madad answer is backed by the same help articles.
            </p>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/help-center">Browse help articles</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Demo-data seeding (additive; existing features untouched) */}
        <SeedDummyDataCard />
      </div>
    </div>
  );
}
