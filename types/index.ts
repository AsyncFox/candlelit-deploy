export interface TSeiueAuthResposnse {
  token_type: 'bearer';
  expires_in: number;
  access_token: string;
  active_reflection_id: number;
};

export interface TVenueResponseItem {
  id: number;
  name: string;
  open_time_ranges: {
    ranges: TSeiueTimeRangeItem[];
    week_days: number[];
  }[];
}

export type TVenueResponse = TVenueResponseItem[];

export interface TCalenderEvents {
  venue_id: number;
  events: TCalenderEventItem[];
}

export interface TCalenderEventItem {
  start_time: string;
  end_time: string;
}

export type TCalenderEventResponse = TCalenderEvents[];

export interface TOrderTimesResponseItem {
  start_at: string;
  end_at: string;
  venue_id: number;
}

export type TOrderTimesResponse = TOrderTimesResponseItem[];

export interface TSeiueTimeRangeItem {
  start_at: string;
  end_at: string;
}

export interface TTimeRangeItem {
  startAt: string;
  endAt: string;

}

export interface TVenue {
  id: number;
  name: string;
  building: 'A' | 'B' | 'C' | 'D';
  floor: string;
  openTimeRanges: {
    ranges: TTimeRangeItem[];
    weekDays: number[];
  }[];
  occupiedTimes: TTimeRangeItem[];
}

export type TVenueList = TVenue[];

export interface TNewOrder {
  capacity: number;
  description: string;
  dateRanges: {
    startAt: string;
    endAt: string;
  };
  timeRanges: {
    startAt: string;
    endAt: string;
  }[];
}

export interface TOrderDetailResponse {
  capacity: number;
  description: string;
  time_ranges: TSeiueTimeRangeItem[];
  venue_id: number;
}

export interface TOrder {
  capacity: number;
  description: string;
  timeRanges: TTimeRangeItem[];
  venueId: number;
  isCandlelit: boolean; // is created using this tool
}

export type TMyOrdersResponse = TOrderDetailResponse[];
