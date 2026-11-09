//+------------------------------------------------------------------+
//|                                     SetupMint_Elefin_Bridge.mq5  |
//|               Copyright 2026, SetupMint Trading Analytics Engine  |
//|                                      https://setupmint.com       |
//+------------------------------------------------------------------+
#property copyright   "SetupMint"
#property link        "https://setupmint.com"
#property version     "1.00"
#property description "Automated Real-Time Live Position & Trade Sync Bridge for SetupMint"
#property strict

//--- Input parameters
input string   InpSetupMintUrl = "http://13.205.58.162/api/v1/integrations/mt5/webhook"; // SetupMint Webhook URL
input string   InpToken        = "6af1fa0735d0f0f584d918bf"; // Account Webhook Token (or 'elefin')
input int      InpSyncTimerSec = 5;                           // Periodic Sync Interval (Seconds)

//--- Global Variables
datetime lastHistoryCheckTime = 0;

//+------------------------------------------------------------------+
//| Helper to send HTTP POST request                                 |
//+------------------------------------------------------------------+
bool SendJsonToSetupMint(string jsonPayload)
{
   char postData[];
   char resultData[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n" +
                    "x-webhook-token: " + InpToken + "\r\n";
   
   StringToCharArray(jsonPayload, postData, 0, WHOLE_ARRAY, CP_UTF8);
   // Remove null terminator at end
   int dataSize = ArraySize(postData) - 1;
   if(dataSize <= 0) return false;
   ArrayResize(postData, dataSize);

   ResetLastError();
   int res = WebRequest("POST", InpSetupMintUrl, headers, 3000, postData, resultData, resultHeaders);
   if(res == -1)
   {
      int err = GetLastError();
      if(err == 4060)
      {
         Print("[SetupMint] ERROR: WebRequest not allowed! Add '", InpSetupMintUrl, "' in MT5 -> Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL");
      }
      else
      {
         Print("[SetupMint] WebRequest error code: ", err);
      }
      return false;
   }
   return true;
}

//+------------------------------------------------------------------+
//| Sync all active open positions                                   |
//+------------------------------------------------------------------+
void SyncAllActivePositions()
{
   int total = PositionsTotal();
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);

   string json = "{\"token\":\"" + InpToken + "\",\"balance\":" + DoubleToString(balance, 2) + ",\"equity\":" + DoubleToString(equity, 2) + ",\"positions\":[";
   
   int added = 0;
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         string sym = PositionGetString(POSITION_SYMBOL);
         ENUM_POSITION_TYPE type = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
         double vol = PositionGetDouble(POSITION_VOLUME);
         double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
         double sl = PositionGetDouble(POSITION_SL);
         double tp = PositionGetDouble(POSITION_TP);
         datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
         double profit = PositionGetDouble(POSITION_PROFIT);
         double swap = PositionGetDouble(POSITION_SWAP);

         if(added > 0) json += ",";
         json += "{";
         json += "\"ticket\":" + IntegerToString(ticket) + ",";
         json += "\"symbol\":\"" + sym + "\",";
         json += "\"type\":\"" + (type == POSITION_TYPE_BUY ? "BUY" : "SELL") + "\",";
         json += "\"volume\":" + DoubleToString(vol, 2) + ",";
         json += "\"price\":" + DoubleToString(openPrice, 5) + ",";
         json += "\"sl\":" + DoubleToString(sl, 5) + ",";
         json += "\"tp\":" + DoubleToString(tp, 5) + ",";
         json += "\"profit\":" + DoubleToString(profit, 2) + ",";
         json += "\"swap\":" + DoubleToString(swap, 2) + ",";
         json += "\"open_time\":\"" + TimeToString(openTime, TIME_DATE|TIME_SECONDS) + "\"";
         json += "}";
         added++;
      }
   }
   json += "]}";

   if(added > 0)
   {
      SendJsonToSetupMint(json);
   }
}

//+------------------------------------------------------------------+
//| Check recently closed orders from Deal History                  |
//+------------------------------------------------------------------+
void CheckClosedDeals()
{
   datetime now = TimeCurrent();
   datetime fromTime = lastHistoryCheckTime > 0 ? lastHistoryCheckTime : (now - 300);
   
   if(!HistorySelect(fromTime, now)) return;
   
   int totalDeals = HistoryDealsTotal();
   for(int i = 0; i < totalDeals; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket > 0)
      {
         ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
         if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT) // Position closed or reversed
         {
            ulong posTicket = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
            string sym = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
            ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
            double vol = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
            double closePrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
            double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
            double fee = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
            double swap = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
            datetime closeTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);

            string json = "{";
            json += "\"token\":\"" + InpToken + "\",";
            json += "\"action\":\"CLOSE\",";
            json += "\"ticket\":" + IntegerToString(posTicket > 0 ? posTicket : dealTicket) + ",";
            json += "\"symbol\":\"" + sym + "\",";
            json += "\"type\":\"" + (dealType == DEAL_TYPE_SELL ? "BUY" : "SELL") + "\","; // Closed opposite side
            json += "\"volume\":" + DoubleToString(vol, 2) + ",";
            json += "\"close_price\":" + DoubleToString(closePrice, 5) + ",";
            json += "\"profit\":" + DoubleToString(profit, 2) + ",";
            json += "\"commission\":" + DoubleToString(fee, 2) + ",";
            json += "\"swap\":" + DoubleToString(swap, 2) + ",";
            json += "\"close_time\":\"" + TimeToString(closeTime, TIME_DATE|TIME_SECONDS) + "\"";
            json += "}";

            SendJsonToSetupMint(json);
         }
      }
   }
   lastHistoryCheckTime = now;
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("[SetupMint] Initializing SetupMint Elefin MT5 Bridge EA...");
   EventSetTimer(InpSyncTimerSec);
   lastHistoryCheckTime = TimeCurrent() - 3600; // Look back 1 hour
   
   // Ping SetupMint server
   string pingJson = "{\"token\":\"" + InpToken + "\",\"action\":\"PING\"}";
   SendJsonToSetupMint(pingJson);
   
   // Initial sync
   SyncAllActivePositions();
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("[SetupMint] SetupMint Bridge EA stopped.");
}

//+------------------------------------------------------------------+
//| Expert trade transaction function (Instant Execution Event)      |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest& request,
                        const MqlTradeResult& result)
{
   // When a deal or order executes, trigger instant sync
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD ||
      trans.type == TRADE_TRANSACTION_ORDER_DELETE ||
      trans.type == TRADE_TRANSACTION_POSITION)
   {
      SyncAllActivePositions();
      CheckClosedDeals();
   }
}

//+------------------------------------------------------------------+
//| Timer function                                                   |
//+------------------------------------------------------------------+
void OnTimer()
{
   SyncAllActivePositions();
   CheckClosedDeals();
}
//+------------------------------------------------------------------+

