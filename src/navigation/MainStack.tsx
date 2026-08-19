import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import MainTabs from "./MainTabs";
import ProfileCompletion from "../screens/ProfileCompletion";
import SharingEdit from "../screens/SharingEdit";
import CommunityDetailModal from "../screens/Communitydetailmodal";
import CommunityManageModal from "../screens/Communitymanagemodal";
import CameraScreen from "../screens/CameraScreen";
import AppearanceScreen from "../screens/AppearanceScreen";
import { AppearanceProvider } from "../screens/AppearanceContext";
import PlanPickerScreen from "../screens/Plans/PlanPickerScreen";
import BookingHistoryScreen from "../screens/ChatAndCourse/BookingHistoryScreen";
import SecuritySettingsScreen from "../screens/Security/SecuritySettingsScreen";
import CourseHubScreen from "../screens/ChatAndCourse/CourseHubScreen";
import RewardCalendarScreen from "../screens/Rewards/RewardCalendarScreen";
const MainStack = createNativeStackNavigator();

const Main = () => {
  return (
    // ✅ AppearanceProvider wraps the whole navigator, NOT registered as a screen
    <AppearanceProvider>
      <MainStack.Navigator screenOptions={{ headerShown: false }}>
        <MainStack.Screen name="MainTabs" component={MainTabs} />
        <MainStack.Screen
          name="ProfileCompletion"
          component={ProfileCompletion}
        />
        <MainStack.Screen
          name="AppearanceScreen"
          component={AppearanceScreen}
        />
        <MainStack.Screen name="SharingEdit" component={SharingEdit} />
        <MainStack.Screen name="CameraScreen" component={CameraScreen} />
        <MainStack.Screen
          name="CommunityDetailModal"
          component={CommunityDetailModal}
        />
        <MainStack.Screen
          name="CommunityManageModal"
          component={CommunityManageModal}
        />
        <MainStack.Screen name="PlanPicker" component={PlanPickerScreen} />
        <MainStack.Screen
          name="BookingHistory"
          component={BookingHistoryScreen}
        />
        <MainStack.Screen
          name="SecuritySettings"
          component={SecuritySettingsScreen}
        />
        <MainStack.Screen name="CourseHub" component={CourseHubScreen} />
        <MainStack.Screen
          name="RewardCalendar"
          component={RewardCalendarScreen}
        />
      </MainStack.Navigator>
    </AppearanceProvider>
  );
};

export default Main;
