# frozen_string_literal: true
require 'csv'
require 'date'
require_relative '../../infrastructure/persistence/operations_store'
require_relative '../../application/ledger/reports'
module Axiom
  class App
    set :operations_store, OperationsStore.new(settings.database)
    set :reports_service, Reports.new(settings.database)

    get('/api/admin/operations') do
      admin!
      answer(data:settings.operations_store.report.merge(policies:settings.policies.current,policy_missing:settings.policies.missing,telegram_configured:!!TelegramAPI.new.configured?))
    end

    get('/api/reports') do
      session!
      period=params.fetch('period','daily')
      report=settings.reports_service.read(@user['id'],period,params['date'],include_rows:true)
      rows=report[:rows]
      content_type 'text/csv; charset=utf-8'
      headers 'Content-Disposition'=>"attachment; filename=axiom-#{period}-#{report[:date]}.csv"
      CSV.generate do |csv|
        csv << %w[referensi bruto komisi neto status dibuat_utc berakhir_utc]
        rows.each do |row|
          reference=row['trx_id'].to_s
          reference="'#{reference}" if reference.match?(/\A[=+@\-]/)
          csv << [reference,row['amount'],row['fee_amount'],row['net_amount'],row['status'],Axiom.iso(row['created_at']),Axiom.iso(row['expires_at'])]
        end
      end
    rescue Date::Error
      raise Error.new(400,'Tanggal laporan tidak valid.')
    end
  end
end
