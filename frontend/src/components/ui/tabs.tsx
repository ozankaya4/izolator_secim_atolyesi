import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
export const Tabs = TabsPrimitive.Root;
export function TabsList(props: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className="tabs-list" {...props} />;
}
export function TabsTrigger(props: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className="tabs-trigger" {...props} />;
}
export function TabsContent(props: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className="tabs-content" {...props} />;
}
