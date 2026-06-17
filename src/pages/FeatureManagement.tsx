import React, { useState } from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Search, Shield, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InventoryValuationConfig } from '@/components/admin/InventoryValuationConfig';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ByCompanyTab } from '@/components/features/admin/ByCompanyTab';
import { ByRoleTab } from '@/components/features/admin/ByRoleTab';
import { ByUserTab } from '@/components/features/admin/ByUserTab';
import { DependenciesTab } from '@/components/features/admin/DependenciesTab';
import { AuditLogTab } from '@/components/features/admin/AuditLogTab';
import { Layout } from '@/components/Layout';

const FeatureManagement = () => {
  const { hasAdminAccess, loading } = useAdminAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Fetch feature flags
  const { data: features, isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .order('category', { ascending: true })
        .order('feature_name', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Toggle feature mutation
  const toggleFeatureMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const { error } = await supabase
        .from('feature_flags')
        .update({ is_enabled: isEnabled })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
      toast.success('Feature updated successfully');
    },
    onError: () => {
      toast.error('Failed to update feature');
    },
  });

  if (loading || isLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (!hasAdminAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  // Group features by category/module
  const groupedFeatures = features?.reduce((acc, feature) => {
    const category = feature.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(feature);
    return acc;
  }, {} as Record<string, typeof features>);

  // Filter features based on search
  const filteredGroupedFeatures = Object.entries(groupedFeatures || {}).reduce((acc, [category, categoryFeatures]) => {
    const filtered = (categoryFeatures as any[])?.filter((feature: any) => 
      feature.feature_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feature.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered && filtered.length > 0) {
      acc[category] = filtered;
    }
    return acc;
  }, {} as Record<string, typeof features>);

  const toggleModule = (category: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedModules(new Set(Object.keys(filteredGroupedFeatures)));
  };

  const collapseAll = () => {
    setExpandedModules(new Set());
  };

  const activeCount = features?.filter(f => f.is_enabled).length || 0;
  const totalCount = features?.length || 0;

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            onClick={() => navigate('/admin-controls')} 
            variant="ghost" 
            size="sm"
            className="p-2"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Feature Management</h1>
            <p className="text-muted-foreground text-sm">Enable or disable features by module</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-xs">
              <Check className="mr-1 h-3 w-3" />
              {activeCount} Active
            </Badge>
            <Badge variant="outline" className="text-xs">
              <X className="mr-1 h-3 w-3" />
              {totalCount - activeCount} Disabled
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="global" className="w-full">
          <TabsList>
            <TabsTrigger value="global">Global Features</TabsTrigger>
            <TabsTrigger value="company">By Company</TabsTrigger>
            <TabsTrigger value="role">By Role</TabsTrigger>
            <TabsTrigger value="user">By User</TabsTrigger>
            <TabsTrigger value="deps">Dependencies</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>

          <TabsContent value="global" className="space-y-4">
        {/* Search and Actions */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search features..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>

        {/* Inventory Valuation Method - General Config */}
        <InventoryValuationConfig />

        {/* Module-wise Feature List */}
        <div className="space-y-3">
          {Object.entries(filteredGroupedFeatures).map(([category, categoryFeatures]) => {
            const isExpanded = expandedModules.has(category);
            const enabledCount = categoryFeatures?.filter(f => f.is_enabled).length || 0;
            const totalInCategory = categoryFeatures?.length || 0;

            return (
              <Collapsible key={category} open={isExpanded} onOpenChange={() => toggleModule(category)}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 bg-card border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <h3 className="font-semibold text-foreground capitalize">{category}</h3>
                        <p className="text-xs text-muted-foreground">
                          {enabledCount} of {totalInCategory} features enabled
                        </p>
                      </div>
                    </div>
                    <Badge variant={enabledCount === totalInCategory ? "default" : "secondary"} className="text-xs">
                      {enabledCount}/{totalInCategory}
                    </Badge>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border border-t-0 rounded-b-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-[40%]">Feature</TableHead>
                          <TableHead className="w-[35%]">Description</TableHead>
                          <TableHead className="w-[15%]">Status</TableHead>
                          <TableHead className="w-[10%] text-right">Toggle</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryFeatures?.map((feature) => (
                          <TableRow key={feature.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{feature.feature_name}</p>
                                <code className="text-xs text-muted-foreground bg-muted px-1 py-0.5 rounded">
                                  {feature.feature_key}
                                </code>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {feature.description || '-'}
                            </TableCell>
                            <TableCell>
                              {feature.is_enabled ? (
                                <Badge variant="default" className="text-xs">Active</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">Disabled</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Switch
                                checked={feature.is_enabled}
                                onCheckedChange={(checked) => {
                                  toggleFeatureMutation.mutate({
                                    id: feature.id,
                                    isEnabled: checked,
                                  });
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>

        {Object.keys(filteredGroupedFeatures).length === 0 && (
          <div className="text-center py-12">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No features found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search criteria
            </p>
          </div>
        )}
          </TabsContent>

          <TabsContent value="company"><ByCompanyTab /></TabsContent>
          <TabsContent value="role"><ByRoleTab /></TabsContent>
          <TabsContent value="user"><ByUserTab /></TabsContent>
          <TabsContent value="deps"><DependenciesTab /></TabsContent>
          <TabsContent value="audit"><AuditLogTab /></TabsContent>
        </Tabs>
        </div>
      </div>
    </Layout>
  );
};

export default FeatureManagement;
