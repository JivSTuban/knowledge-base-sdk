-- Add cost column to track API costs for conversation logging
ALTER TABLE knowledge_base.conversations 
ADD COLUMN IF NOT EXISTS cost DECIMAL(10, 6);

-- Add comment for documentation
COMMENT ON COLUMN knowledge_base.conversations.cost IS 'Estimated API cost for this conversation in USD';
