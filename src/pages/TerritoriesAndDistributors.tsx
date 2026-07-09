import React from 'react';
import { Layout } from '@/components/Layout';
import TerritoriesManagement from '@/components/TerritoriesManagement';

const TerritoryMaster = () => {
  return (
    <Layout>
      <div className="min-h-screen">
        {/* Header Section */}
        <div className="relative overflow-hidden bg-gradient-primary text-primary-foreground">
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent"></div>
          <div className="relative p-4 sm:p-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Territory Master</h1>
              <p className="text-primary-foreground/80 text-sm sm:text-base mt-1">Manage your territory assignments and regions</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="w-full">
            <TerritoriesManagement />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default TerritoryMaster;
