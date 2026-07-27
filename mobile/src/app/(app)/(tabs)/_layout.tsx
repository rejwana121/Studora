import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { color } from '@/design-system/tokens';

function tabIcon(focused: keyof typeof Ionicons.glyphMap, outline: keyof typeof Ionicons.glyphMap) {
  function TabIcon({ color: tintColor, size, focused: isFocused }: { color: string; size: number; focused: boolean }) {
    return <Ionicons name={isFocused ? focused : outline} size={size} color={tintColor} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.primary.violet,
        tabBarInactiveTintColor: color.text.secondary,
        tabBarStyle: {
          backgroundColor: color.background.card,
          borderTopColor: color.border.divider,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarIcon: tabIcon('today', 'today-outline') }}
      />
      <Tabs.Screen
        name="tasks"
        options={{ title: 'Tasks', tabBarIcon: tabIcon('checkbox', 'checkbox-outline') }}
      />
      <Tabs.Screen
        name="planner"
        options={{ title: 'Planner', tabBarIcon: tabIcon('calendar', 'calendar-outline') }}
      />
      <Tabs.Screen
        name="focus"
        options={{ title: 'Focus', tabBarIcon: tabIcon('timer', 'timer-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person', 'person-outline') }}
      />
    </Tabs>
  );
}
