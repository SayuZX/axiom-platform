# frozen_string_literal: true
require_relative '../../application/receipts/receipts'
module Axiom
  class App
    set :receipts_service, Receipts.new(settings.database)
    get('/api/receipts/:kind/:id.png') do
      user=session!
      data=settings.receipts_service.png(params['kind'],params['id'],user)
      content_type 'image/png'
      headers 'Cache-Control'=>'private, no-store, max-age=0','Vary'=>'Cookie','Pragma'=>'no-cache','Content-Disposition'=>"#{params['download']=='1' ? 'attachment' : 'inline'}; filename=\"axiom-#{params['kind']}-receipt.png\""
      data
    end
  end
end
