# frozen_string_literal: true
module Axiom
  module WithdrawalDestinations
    # Curated manual-transfer destinations, not a registry or payout-provider capability list.
    GROUPS=[
      {label:'Bank konvensional',kind:'bank',names:['BCA','BRI','BNI','Mandiri','CIMB Niaga','Permata Bank','Bank Danamon','Bank Maybank Indonesia','OCBC','Panin Bank','Bank Mega','Bank Sinarmas','Bank UOB Indonesia','Bank HSBC Indonesia','Standard Chartered Indonesia','Bank BTPN','Bank MNC Internasional','Bank Artha Graha Internasional','Bank Bukopin','Bank Woori Saudara','Bank JTrust Indonesia']},
      {label:'Bank syariah',kind:'bank',names:['Bank Syariah Indonesia (BSI)','BCA Syariah','Bank Muamalat','Bank Mega Syariah','Bank Panin Dubai Syariah','Bank BTPN Syariah','Bank Victoria Syariah','Bank Aladin Syariah','Bank Aceh Syariah','Bank NTB Syariah','Bank Riau Kepri Syariah','Bank Jabar Banten Syariah','Bank Nano Syariah']},
      {label:'Bank digital',kind:'bank',names:['Bank Jago','Bank Jago Syariah','Bank Neo Commerce','SeaBank','blu by BCA Digital','Jenius (Bank BTPN)','Bank Saqu','Allo Bank','Superbank','Krom Bank','Bank Raya','Bank Hibank']},
      {label:'Bank daerah',kind:'bank',names:['Bank Jakarta (DKI)','Bank BJB','Bank Jateng','Bank Jatim','Bank BPD DIY','Bank Banten','Bank Sumut','Bank Nagari','Bank Sumsel Babel','Bank Jambi','Bank Bengkulu','Bank Lampung','Bank Kalbar','Bank Kalteng','Bank Kalsel','Bank Kaltimtara','Bank Sulselbar','Bank SulutGo','Bank Sulteng','Bank Sultra','Bank BPD Bali','Bank NTT','Bank Maluku Malut','Bank Papua']},
      {label:'E-wallet',kind:'wallet',names:['DANA','GoPay','OVO','ShopeePay','LinkAja','i.saku']}
    ].each{|group|group[:names].freeze;group.freeze}.freeze
    def self.validate!(name,number)
      group=GROUPS.find{|entry|entry[:names].include?(name)}
      raise Error.new(400,'Pilih bank atau e-wallet dari daftar tujuan penarikan.') unless group
      if group[:kind]=='wallet'
        raise Error.new(400,'Nomor HP e-wallet harus berformat 08 (10–13 digit) atau 628 (11–14 digit), tanpa spasi atau tanda +.') unless number.is_a?(String) && number.match?(/\A(?:08[1-9][0-9]{7,10}|628[1-9][0-9]{7,10})\z/)
      else
        raise Error.new(400,'Nomor rekening harus berisi 6–34 digit.') unless number.is_a?(String) && number.match?(/\A[0-9]{6,34}\z/)
      end
    end
  end
end
