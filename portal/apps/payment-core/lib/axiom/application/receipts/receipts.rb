# frozen_string_literal: true
require 'json'
require 'time'
require 'open3'
require 'timeout'
require 'base64'
module Axiom
  class Receipts
    MONTHS=%w[Januari Februari Maret April Mei Juni Juli Agustus September Oktober November Desember].freeze
    def initialize(db) = @db=db
    def money(value) = 'Rp'+value.to_s.reverse.scan(/.{1,3}/).join('.').reverse
    def masked(value)
      value.to_s.split.first(2).map{|part|part[0].to_s+'***'}.join(' ')
    end
    def document(kind,id,user)
      raise Error.new(401,'Silakan masuk ke akun Anda.') unless user && user['id']
      table={'payment'=>'payments','withdrawal'=>'withdrawals'}[kind]
      raise Error.new(404,'Bukti tidak ditemukan.') unless table
      row=@db.connection.get_first_row("SELECT * FROM #{table} WHERE id=?",[id])
      raise Error.new(404,'Bukti tidak ditemukan.') unless row && (user['role']=='admin' || row['customer_id']==user['id'])
      raise Error.new(409,'Bukti tersedia setelah transaksi selesai terkonfirmasi.') unless row['status']=='PAID'
      amount=row['amount'];fee=kind=='payment' ? row['fee_amount'] : 0
      raise Error.new(409,'Nominal bukti belum dapat diverifikasi.') unless amount.is_a?(Integer) && amount.between?(1,9007199254740991) && fee.is_a?(Integer) && fee.between?(0,amount)
      if kind=='payment'
        tx=JSON.parse(row['transaction_json'].to_s)
        raise Error.new(409,'Konfirmasi provider belum tersedia.') unless tx.is_a?(Hash) && tx['confirmed_at'].is_a?(String) && !tx['transaction_id'].to_s.empty?
        stamp=Time.iso8601(tx.fetch('confirmed_at'))
        recipient=@db.connection.get_first_value('SELECT username FROM customers WHERE id=?',[row['customer_id']])
        rows=[['Referensi transaksi',row['trx_id']],['Referensi provider',tx['transaction_id']],['Penerima',masked(recipient)],['Metode','QRIS'],['Nominal bruto',money(amount)],['Komisi platform',money(fee)],['Neto pelanggan',money(amount-fee)]]
      else
        raise Error.new(409,'Bukti transfer belum lengkap.') unless row['completed_at'].is_a?(Integer) && !row['transfer_reference'].to_s.empty?
        stamp=Time.at(Rational(row['completed_at'],1000))
        rows=[['Referensi penarikan',row['id']],['Referensi transfer',row['transfer_reference']],['Bank / dompet digital',row['bank_name']],['Penerima',masked(row['account_holder'])],['Rekening tujuan','****'+row['account_number'].to_s[-4,4].to_s],['Biaya penarikan',money(0)],['Nominal diterima',money(amount)]]
      end
      stamp=stamp.getlocal('+07:00')
      rows<<['Dikonfirmasi',"#{stamp.day} #{MONTHS[stamp.month-1]} #{stamp.year}, #{stamp.strftime('%H:%M:%S')} WIB"]
      {title:kind=='payment' ? 'Bukti pembayaran' : 'Bukti penarikan',amount:money(amount),status:'BERHASIL',rows:rows,footer:'Catatan transaksi Axiom Payment. Bukan bukti yang diterbitkan bank.'}
    rescue JSON::ParserError,KeyError,ArgumentError
      raise Error.new(409,'Waktu konfirmasi bukti belum tersedia.')
    end
    def png(kind,id,user) = self.class.render(document(kind,id,user))
    def self.render(document)
      script=File.expand_path('../../infrastructure/integrations/receipt.ps1',__dir__)
      executable=File.join(ENV.fetch('SystemRoot','C:/Windows'),'System32','WindowsPowerShell','v1.0','powershell.exe')
      result=nil
      Open3.popen3(executable,'-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script) do |input,output,error,process|
        reader=Thread.new{output.read(3_000_001)}
        errors=Thread.new{error.read(8192)}
        begin
          Timeout.timeout(20) do
            input.write(JSON.generate(document));input.close
            encoded=reader.value
            raise Error.new(503,'Gambar bukti belum dapat dibuat.') unless process.value.success? && encoded.bytesize<=3_000_000
            result=Base64.strict_decode64(encoded.strip)
            raise Error.new(503,'Gambar bukti tidak valid.') unless result.start_with?("\x89PNG\r\n\x1a\n".b)
          end
        ensure
          Process.kill('KILL',process.pid) if process.alive?
          reader.join;errors.join
        end
      end
      result
    rescue Timeout::Error,SystemCallError,IOError,ArgumentError
      raise Error.new(503,'Gambar bukti belum dapat dibuat. Coba lagi nanti.')
    end
  end
end
