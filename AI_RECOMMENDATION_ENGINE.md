# AI Recommendation Engine Documentation
# Abhishek S.

## Overview
This document describes the AI-driven recommendation engine implemented in the sales app to help users make better decisions about beat planning, retailer visits, and sales conversations.

## Features Implemented

### 1. **Beat Visit Priority Recommendations**
**Location:** My Beats page → AI Insights tab

**What it does:**
- Analyzes all your beats based on:
  - Time since last visit
  - Number of retailers in each beat
  - Historical order values
  - Retailer potential levels
- Recommends top 3 beats to visit next
- Provides confidence scores (0-100%) for each recommendation
- Explains the reasoning behind each suggestion

**How to use:**
1. Go to "My Beats" page
2. Click on "AI Insights" tab
3. Click "Generate New Insights" button
4. Review the top 3 recommended beats
5. Click "Helpful" or "Not Helpful" to provide feedback

### 2. **Retailer Priority Recommendations**
**Location:** My Visits page (when a beat is planned for the day)

**What it does:**
- Shows a smart banner with priority retailers to visit
- Considers:
  - Last visit date (prioritizes not visited recently)
  - Potential level (high/medium/low)
  - Historical order values and growth trends
  - Order frequency patterns
- Ranks top 5 retailers with priority scores
- Provides reasoning for each retailer's ranking

**How to use:**
1. Go to "My Visits" page
2. Select a date with planned beats
3. Look for the "Priority Retailers" AI banner
4. Click "Get Insights" to generate recommendations
5. Expand/collapse the banner using the arrow
6. Provide feedback on recommendations

### 3. **Discussion Points (AI Conversation Starters)**
**Location:** Can be triggered for individual retailers

**What it does:**
- Generates 5-7 personalized talking points for retailer meetings
- Based on:
  - Previous order patterns and buying behavior
  - Active schemes and promotions
  - Competitor insights in the area
  - Performance vs similar retailers
  - Cross-sell and up-sell opportunities
- Helps gather feedback and share territory insights
- Suggests products based on purchase history
- Highlights relevant schemes
- Encourages growth with data-backed insights

**How to use:**
1. Navigate to a specific retailer
2. Generate discussion points recommendation
3. Use the talking points during your visit
4. Mark as "Implemented" if you used them

### 4. **Beat Performance Prediction**
**Location:** Can be generated for specific beats

**What it does:**
- Predicts beat revenue for next 30 days
- Analyzes:
  - 6-month order value trends
  - Number of retailers and their potential
  - Seasonal patterns
  - Growth rates
- Provides confidence level for prediction
- Identifies key factors influencing performance
- Suggests actions to maximize performance

**How to use:**
1. Select a beat
2. Request performance prediction
3. Review predicted revenue and confidence score
4. Read key influencing factors
5. Follow recommendations to improve performance

### 5. **Optimal Visit Day Recommendation**
**Location:** Beat-specific recommendations

**What it does:**
- Recommends best day of week to visit each beat
- Analyzes:
  - Historical order patterns by day
  - Previous visit success rates
  - Order placement trends
- Provides alternative best days
- Explains reasoning based on data patterns

**How to use:**
1. View beat details
2. Generate optimal day recommendation
3. Plan your weekly schedule accordingly
4. Adjust beat plans based on suggestions

## Algorithm & Logic

### Beat Visit Priority Scoring
```
Priority Score = 
  (Days Since Last Visit × 0.4) +
  (Retailer Count × 0.2) +
  (Total Potential Value × 0.3) +
  (Historical Order Value × 0.1)

Normalized to 0-1 scale
```

### Retailer Priority Scoring
```
Priority Score =
  (Days Since Last Visit × 0.35) +
  (Potential Level × 0.25) +
  (Average Order Value × 0.20) +
  (Growth Rate × 0.15) +
  (Order Frequency × 0.05)

Normalized to 0-1 scale
```

### AI Model Used
- **Provider:** Lovable AI Gateway
- **Model:** Google Gemini 2.5 Flash
- **Reasoning:** Fast, cost-effective, excellent at data analysis
- **Temperature:** 0.7 (balanced between creativity and consistency)

## Database Schema

### Tables Created

1. **recommendations**
   - `id`: UUID (primary key)
   - `user_id`: UUID (foreign key to auth.users)
   - `recommendation_type`: TEXT (beat_visit | retailer_priority | discussion_points | beat_performance | optimal_day)
   - `entity_id`: UUID (beat_id or retailer_id)
   - `entity_name`: TEXT
   - `recommendation_data`: JSONB (AI response)
   - `confidence_score`: DECIMAL(3,2) (0.00 to 1.00)
   - `reasoning`: TEXT
   - `created_at`: TIMESTAMPTZ
   - `expires_at`: TIMESTAMPTZ (24 hours from creation)
   - `is_active`: BOOLEAN

2. **recommendation_feedback**
   - `id`: UUID (primary key)
   - `recommendation_id`: UUID (foreign key)
   - `user_id`: UUID (foreign key)
   - `feedback_type`: TEXT (like | dislike | implemented | ignored)
   - `feedback_note`: TEXT
   - `created_at`: TIMESTAMPTZ

## Edge Function

**Name:** `generate-recommendations`

**Purpose:** Generates AI-powered recommendations based on user data

**Authentication:** Required (JWT token)

**Parameters:**
- `recommendationType`: string (beat_visit | retailer_priority | discussion_points | beat_performance | optimal_day)
- `entityId`: string (optional - beat_id or retailer_id)

**Response:**
```json
{
  "recommendation": {
    "id": "uuid",
    "recommendation_data": { /* AI-generated content */ },
    "confidence_score": 0.85,
    "reasoning": "Explanation of recommendation"
  }
}
```

## UI Components

### RecommendationCard
- Displays individual recommendations
- Shows confidence scores with progress bars
- Renders different content based on type
- Includes feedback buttons (like/dislike)
- Compact mode for banners

### AIRecommendationBanner
- Collapsible banner for My Visits page
- Shows recommendations inline
- Quick access to AI insights
- Expandable/collapsible interface

## User Feedback System

Users can provide feedback on recommendations:
- **Like** ✓ - Recommendation was helpful
- **Dislike** ✗ - Recommendation wasn't useful
- **Implemented** - Actually used the suggestion
- **Ignored** - Saw but didn't use

Feedback is stored and can be used to:
- Improve future recommendations
- Track AI effectiveness
- Identify patterns in user preferences

## Data Privacy & Security

- All recommendations are user-specific (RLS enabled)
- Users can only see their own recommendations
- Recommendations expire after 24 hours
- Feedback is anonymous to the AI system
- No sensitive retailer data leaves your system

## Performance Optimization

- Recommendations are cached for 24 hours
- Parallel data fetching for speed
- Indexed database queries
- Real-time updates via Supabase subscriptions

## Best Practices for Users

1. **Generate recommendations regularly** - Daily or weekly
2. **Provide feedback** - Helps improve accuracy over time
3. **Combine with your expertise** - AI assists, you decide
4. **Review reasoning** - Understand why suggestions are made
5. **Track implementation** - Mark what you actually use

## Troubleshooting

### No recommendations showing?
- Ensure you have created beats and retailers
- Check that you have historical order data
- Verify beat is planned for the selected date

### AI generation fails?
- Check your internet connection
- Verify Lovable AI credits are available
- Check edge function logs in Supabase dashboard

### Low confidence scores?
- Add more historical data
- Complete retailer profiles
- Track visits and orders consistently

## Future Enhancements (Potential)

1. **Scheme-based recommendations** - Suggest schemes to offer
2. **Product recommendations** - What products to push
3. **Route optimization** - Best sequence to visit retailers
4. **Inventory predictions** - What stock retailers need
5. **Competitor alerts** - When competitor activity detected
6. **Seasonal patterns** - Holiday and season-based insights

## Technical Details

### API Rate Limits
- Lovable AI: Per workspace limits
- Recommendation generation: ~2-5 seconds per request
- Cached results: Instant retrieval

### Cost Estimates
- Google Gemini 2.5 Flash: Very cost-effective
- ~1000 recommendations: Minimal cost
- Caching reduces API calls significantly

## Support

For issues or questions:
1. Check edge function logs
2. Review browser console for errors
3. Verify database permissions
4. Check network tab for API failures

---

**Last Updated:** Current implementation
**Version:** 1.0
**AI Model:** Google Gemini 2.5 Flash via Lovable AI Gateway
