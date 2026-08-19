export type MainStackParamList = {
  MainTabs: undefined;
  ProfileCompletion: undefined;
  SharingEdit: undefined;
  MyMenu: undefined;
  MyTaskMenu: undefined;
  TaskPlanner: undefined;
  Calender: undefined;
  TaskCharts: undefined;
  Achievements: undefined;
  Analytics: undefined;
  AIChat: undefined;
  CameraScreen: undefined;
  AppearanceScreen: undefined;
  BookingHistory: undefined;
  PlanPicker: { presetCategory?: string };
  SecuritySettings: undefined;
  CourseHub: undefined;
  RewardCalendar: undefined;

  ShareOptions: {
    diaryData: any;
  };
  QRCodeGenerate: {
    diaryData: any;
  };
  MyPrint: {
    diaryData: any;
  };
  Charts: undefined;
};
type CategoryType = {
  startDate: number;
  CreatedUser: {
    CreatedUserPhoto: string;
    CreatedUserName: string;
    CreatedUserId: string;
  };
  categoryName: string;
  categoryDescription: string;
  updatedDate: number;
  key: string;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgetPassword: undefined;
};

export type MainTabsParamList = {
  Home: undefined;
  Health: undefined;
  Profile: undefined;
  Sharing: undefined;
  Coach: undefined;
};
