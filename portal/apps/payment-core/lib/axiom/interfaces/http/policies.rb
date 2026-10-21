# frozen_string_literal: true
require_relative '../../application/policies/policies'
module Axiom
  class App
    set :policies, Policies.new(settings.database)

    get('/api/policies') do
      answer(data:settings.policies.current)
    end

    get('/api/policies/:slug') do
      answer(data:{document:settings.policies.document(params['slug'],version:params['version'])})
    end

    get('/api/admin/policies/:slug') do
      admin!
      answer(data:{document:settings.policies.document(params['slug'],draft:true)})
    end

    post('/api/policies/consent') do
      session!
      version=settings.policies.validate_registration(request_data)
      settings.policies.store.consent(@user['id'],version,'web')
      answer(data:{version:version})
    end
  end
end
