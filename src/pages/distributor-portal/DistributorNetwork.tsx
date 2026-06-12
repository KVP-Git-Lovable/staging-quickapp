import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, Phone, MapPin, Loader2 } from "lucide-react";

interface DistributorContext {
  distributorId: string;
  distributorName: string;
}

interface ChildDistributor {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string | null;
  address: string | null;
  status: string;
  type_id: string | null;
  typeName?: string;
  typeCode?: string;
}

export default function DistributorNetwork() {
  const { distributorId } = useOutletContext<DistributorContext>();
  const navigate = useNavigate();
  const [children, setChildren] = useState<ChildDistributor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!distributorId) {
      setLoading(false);
      return;
    }
    const fetchChildren = async () => {
      // FK now exists — use PostgREST join directly
      const { data } = await supabase
        .from("distributors")
        .select("id, name, contact_person, phone, email, address, status, type_id, distributor_types(name, code)")
        .eq("parent_id", distributorId)
        .order("name");

      const enriched: ChildDistributor[] = (data || []).map((c: any) => ({
        ...c,
        typeName: c.distributor_types?.name,
        typeCode: c.distributor_types?.code,
      }));

      setChildren(enriched);
      setLoading(false);
    };
    fetchChildren();
  }, [distributorId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Summary by type
  const typeCounts = new Map<string, number>();
  children.forEach((c) => {
    const label = c.typeName || "Untyped";
    typeCounts.set(label, (typeCounts.get(label) || 0) + 1);
  });

  const statusColor = (s: string) => {
    if (s === "active" || s === "onboarded") return "bg-green-100 text-green-800";
    if (s === "inactive") return "bg-red-100 text-red-800";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-bold text-foreground">My Network</h1>

      {children.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">No child distributors found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {Array.from(typeCounts.entries()).map(([label, count]) => (
              <Badge key={label} variant="outline" className="text-xs gap-1">
                {label}: <span className="font-bold">{count}</span>
              </Badge>
            ))}
            <Badge variant="secondary" className="text-xs gap-1">
              Total: <span className="font-bold">{children.length}</span>
            </Badge>
          </div>

          {/* Card grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((child) => (
              <Card
                key={child.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/distributor-portal/network/${child.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                        {child.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-foreground truncate">{child.name}</h3>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {child.typeName && (
                          <Badge variant="outline" className="text-[10px]">
                            {child.typeName} • {child.typeCode}
                          </Badge>
                        )}
                        <Badge className={`text-[10px] ${statusColor(child.status)}`}>
                          {child.status?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                        </Badge>
                      </div>
                      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        {child.contact_person && <p>{child.contact_person}</p>}
                        {child.phone && (
                          <p className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {child.phone}
                          </p>
                        )}
                        {child.address && (
                          <p className="flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{child.address}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
