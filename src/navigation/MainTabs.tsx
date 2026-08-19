import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MainTabsParamList } from "../types/navigation";

import { themeColor, useTheme } from "react-native-rapi-ui";
import TabBarIcon from "../components/utils/TabBarIcon";
import TabBarText from "../components/utils/TabBarText";

import Home from "../screens/Home";
import Profile from "../screens/Profile";
import Sharing from "../screens/Sharing";
import Marketplace from "../screens/Marketplace";
import HealthReportScreen from "../screens/HealthReportScreen";
import { ScreenStackHeaderConfig } from "react-native-screens";
import ChatAndCoursesScreen from "../screens/ChatAndCourse/ChatAndCoursesScreen";

const Tabs = createBottomTabNavigator<MainTabsParamList>();
const MainTabs = () => {
  const { isDarkmode } = useTheme();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          borderTopColor: isDarkmode ? themeColor.dark100 : "#c0c0c0",
          backgroundColor: isDarkmode ? themeColor.dark200 : "#ffffff",
        },
      }}
    >
      {/* these icons using Ionicons */}
      <Tabs.Screen
        name="Home"
        component={Home}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabBarText focused={focused} title="Home" />
          ),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} icon={"home-outline"} />
          ),
        }}
      />
      <Tabs.Screen
        name="Health"
        component={HealthReportScreen}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabBarText focused={focused} title="Health" />
          ),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} icon={"pulse-outline"} />
          ),
        }}
      />
      <Tabs.Screen
        name="ChatAndCoursesScreen"
        options={{
          tabBarLabel: ({ focused }) => (
            <TabBarText focused={focused} title="Fitness" />
          ),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} icon={"barbell-outline"} />
          ),
        }}
      >
        {({ navigation }) => (
          <ChatAndCoursesScreen
            onNavigateToPlans={(category) =>
              navigation.navigate("PlanPicker", { presetCategory: category })
            }
            onNavigateToHistory={() => navigation.navigate("BookingHistory")}
            onOpenCourseHub={(courseId) =>
              navigation.navigate("CourseHub", { courseId })
            }
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen
        name="Marketplace"
        component={Marketplace}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabBarText focused={focused} title="Marketplace" />
          ),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} icon={"cart-outline"} />
          ),
        }}
      />

      <Tabs.Screen
        name="Sharing"
        component={Sharing}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabBarText focused={focused} title="Sharing" />
          ),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} icon={"heart"} />
          ),
        }}
      />
      <Tabs.Screen
        name="Profile"
        component={Profile}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabBarText focused={focused} title="Profile" />
          ),
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} icon={"person-outline"} />
          ),
        }}
      />
    </Tabs.Navigator>
  );
};

export default MainTabs;
